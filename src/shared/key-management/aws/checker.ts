import axios, { AxiosError, AxiosRequestConfig, AxiosHeaders } from "axios";
import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { URL } from "url";
import { KeyCheckerBase } from "../key-checker-base";
import type { AwsBedrockKey, AwsBedrockKeyProvider } from "./provider";
import { config } from "../../../config";

const MIN_CHECK_INTERVAL = 3 * 1000; // 3 seconds
const KEY_CHECK_PERIOD = 3 * 60 * 1000; // 3 minutes
const GET_CALLER_IDENTITY_URL = `https://sts.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15`;
const GET_INVOCATION_LOGGING_CONFIG_URL = (region: string) =>
  `https://bedrock.${region}.amazonaws.com/logging/modelinvocations`;
const POST_INVOKE_MODEL_URL = (region: string, model: string) =>
  `https://invoke-bedrock.${region}.amazonaws.com/model/${model}/invoke`;
const TEST_PROMPT = "\n\nHuman:\n\nAssistant:";

type AwsError = { error: {} };

type GetLoggingConfigResponse = {
  loggingConfig: null | {
    cloudWatchConfig: null | unknown;
    s3Config: null | unknown;
    embeddingDataDeliveryEnabled: boolean;
    imageDataDeliveryEnabled: boolean;
    textDataDeliveryEnabled: boolean;
  };
};

type UpdateFn = typeof AwsBedrockKeyProvider.prototype.update;

export class AwsKeyChecker extends KeyCheckerBase<AwsBedrockKey> {
  private readonly updateKey: UpdateFn;

  constructor(keys: AwsBedrockKey[], updateKey: UpdateFn) {
    super(keys, {
      service: "aws",
      keyCheckPeriod: KEY_CHECK_PERIOD,
      minCheckInterval: MIN_CHECK_INTERVAL,
    });
    this.updateKey = updateKey;
  }

  protected async checkKey(key: AwsBedrockKey) {
    if (key.isDisabled) {
      this.log.warn({ key: key.hash }, "Skipping check for disabled key.");
      this.scheduleNextCheck();
      return;
    }

    this.log.debug({ key: key.hash }, "Checking key...");
    let isInitialCheck = !key.lastChecked;
    try {
      const checks: Promise<unknown>[] = [this.testLogging(key)];
      // Only check models on startup.  For now all models must be available to
      // the proxy because we don't route requests to different keys.
      if (isInitialCheck) {
        checks.push(this.invokeModel("anthropic.claude-v1", key));
        checks.push(this.invokeModel("anthropic.claude-v2", key));
      }

      const [logged] = await Promise.all(checks);
      if (logged) this.handleLoggedKey(key);

      this.updateKey(key.hash, {});
      this.log.info(
        { key: key.hash, models: key.modelFamilies, logged },
        "Key check complete."
      );
    } catch (error) {
      // touch the key so we don't check it again for a while
      this.updateKey(key.hash, {});
      this.handleAxiosError(key, error as AxiosError);
    }

    this.lastCheck = Date.now();
    // Only enqueue the next check if this wasn't a startup check, since those
    // are batched together elsewhere.
    if (!isInitialCheck) {
      this.scheduleNextCheck();
    }
  }

  /**
   * If model invocation logging is enabled for a key, we can only use the key
   * if the proxy operator has opted into allowing logged keys.
   */
  private handleLoggedKey(key: AwsBedrockKey) {
    if (!config.allowAwsLogging) {
      this.log.warn(
        { key: key.hash },
        "Key may have model invocation logging enabled and proxy is not configured to allow this; disabling."
      );
      return this.updateKey(key.hash, { isDisabled: true });
    }
  }

  protected handleAxiosError(key: AwsBedrockKey, error: AxiosError) {
    if (error.response && AwsKeyChecker.errorIsAwsError(error)) {
      const errorHeader = error.response.headers["x-amzn-errortype"] as string;
      const errorType = errorHeader.split(":")[0];
      switch (errorType) {
        case "AccessDeniedException":
          // Indicates that the principal's attached policy does not allow them
          // to perform the requested action.
          // How we handle this depends on whether the action was one that we
          // must be able to perform in order to use the key.
          const action = error.config?.url?.split("/").pop();
          const data = error.response.data;
          this.log.warn(
            { key: key.hash, type: errorType, action, data },
            "Key cannot perform required action or invoke required model; disabling."
          );
          return this.updateKey(key.hash, { isDisabled: true });
        case "UnrecognizedClientException":
          // This is a 403 error that indicates the key is revoked.
          this.log.warn(
            { key: key.hash, errorType, error: error.response.data },
            "Key is revoked; disabling."
          );
          return this.updateKey(key.hash, {
            isDisabled: true,
            isRevoked: true,
          });
        case "ThrottlingException":
          // This is a 429 error that indicates the key is rate-limited, but
          // not necessarily disabled. Retry in 10 seconds.
          this.log.warn(
            { key: key.hash, errorType, error: error.response.data },
            "Key is rate limited. Rechecking in 10 seconds."
          );
          const next = Date.now() - (KEY_CHECK_PERIOD - 10 * 1000);
          return this.updateKey(key.hash, { lastChecked: next });
        case "ValidationException":
        default:
          // This indicates some issue that we did not account for, possibly
          // a new ValidationException type. This likely means our key checker
          // needs to be updated so we'll just let the key through and let it
          // fail when someone tries to use it if the error is fatal.
          this.log.error(
            { key: key.hash, errorType, error: error.response.data },
            "Encountered unexpected error while checking key. This may indicate a change in the API; please report this."
          );
          return this.updateKey(key.hash, { lastChecked: Date.now() });
      }
    }
    const { response } = error;
    const { headers, status, data } = response ?? {};
    this.log.error(
      { key: key.hash, status, headers, data, error: error.message },
      "Network error while checking key; trying this key again in a minute."
    );
    const oneMinute = 60 * 1000;
    const next = Date.now() - (KEY_CHECK_PERIOD - oneMinute);
    this.updateKey(key.hash, { lastChecked: next });
  }

  private async invokeModel(model: string, key: AwsBedrockKey) {
    const creds = AwsKeyChecker.getCredentialsFromKey(key);
    // This is not a valid invocation payload, but a 400 response indicates that
    // the principal at least has permission to invoke the model.
    const payload = {
      max_tokens_to_sample: -1,
      stream: false,
      prompt: TEST_PROMPT,
    };
    const config: AxiosRequestConfig = {
      method: "POST",
      url: POST_INVOKE_MODEL_URL(creds.region, model),
      data: payload,
      validateStatus: (status) => status === 400,
    };
    config.headers = new AxiosHeaders({
      "content-type": "application/json",
      accept: "*/*",
    });
    await AwsKeyChecker.signRequestForAws(config, key);
    const response = await axios.request(config);
    const { data, status, headers } = response;
    const errorType = (headers["x-amzn-errortype"] as string).split(":")[0];
    const errorMessage = data?.message;

    // We're looking for a specific error type and message here:
    // "ValidationException"
    // "Malformed input request: -1 is not greater or equal to 0, please reformat your input and try again."
    // "Malformed input request: 2 schema violations found, please reformat your input and try again." (if there are multiple issues)
    const correctErrorType = errorType === "ValidationException";
    const correctErrorMessage = errorMessage?.match(/malformed input request/i);
    if (!correctErrorType || !correctErrorMessage) {
      throw new AxiosError(
        `Unexpected error when invoking model ${model}: ${errorMessage}`,
        "AWS_ERROR",
        response.config,
        response.request,
        response
      );
    }

    this.log.debug(
      { key: key.hash, errorType, data, status },
      "Liveness test complete."
    );
    return { model, valid: true };
  }

  private async testLogging(key: AwsBedrockKey): Promise<boolean> {
    const creds = AwsKeyChecker.getCredentialsFromKey(key);
    const config: AxiosRequestConfig = {
      method: "GET",
      url: GET_INVOCATION_LOGGING_CONFIG_URL(creds.region),
      headers: { accept: "application/json" },
      validateStatus: () => true,
    };
    await AwsKeyChecker.signRequestForAws(config, key);
    const { data, status, headers } =
      await axios.request<GetLoggingConfigResponse>(config);

    if (status === 200) {
      const { loggingConfig } = data;
      const loggingEnabled = !!loggingConfig?.textDataDeliveryEnabled;
      this.log.info(
        { key: key.hash, loggingConfig, loggingEnabled },
        "AWS model invocation logging test complete."
      );

      // The double boolean negation is confusing but intentional; the flag on
      // the key asserts that we were able to check and determine the logging
      // status, whereas the default when we cannot check is to assume that
      // logging *could* be enabled, but we don't know for sure.
      // Might be better represented as an enum.
      this.updateKey(key.hash, { loggingDisabled: !loggingEnabled });
      return loggingEnabled;
    }

    const errorType = (headers["x-amzn-errortype"] as string).split(":")[0];
    this.log.warn(
      { key: key.hash, errorType, data, status },
      "AWS model invocation logging status could not be determined. Assuming key may be logged."
    );
    return true;
  }

  static errorIsAwsError(error: AxiosError): error is AxiosError<AwsError> {
    const headers = error.response?.headers;
    if (!headers) return false;
    return !!headers["x-amzn-errortype"];
  }

  /** Given an Axios request, sign it with the given key. */
  static async signRequestForAws(
    axiosRequest: AxiosRequestConfig,
    key: AwsBedrockKey,
    awsService = "bedrock"
  ) {
    const creds = AwsKeyChecker.getCredentialsFromKey(key);
    const { accessKeyId, secretAccessKey, region } = creds;
    const { method, url: axUrl, headers: axHeaders, data } = axiosRequest;
    const url = new URL(axUrl!);

    let plainHeaders = {};
    if (axHeaders instanceof AxiosHeaders) {
      plainHeaders = axHeaders.toJSON();
    } else if (typeof axHeaders === "object") {
      plainHeaders = axHeaders;
    }

    const request = new HttpRequest({
      method,
      protocol: "https:",
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { Host: url.hostname, ...plainHeaders },
    });

    if (data) {
      request.body = JSON.stringify(data);
    }

    const signer = new SignatureV4({
      sha256: Sha256,
      credentials: { accessKeyId, secretAccessKey },
      region,
      service: awsService,
    });
    const signedRequest = await signer.sign(request);
    axiosRequest.headers = signedRequest.headers;
  }

  static getCredentialsFromKey(key: AwsBedrockKey) {
    const [accessKeyId, secretAccessKey, region] = key.key.split(":");
    if (!accessKeyId || !secretAccessKey || !region) {
      throw new Error("Invalid AWS Bedrock key");
    }
    return { accessKeyId, secretAccessKey, region };
  }
}
