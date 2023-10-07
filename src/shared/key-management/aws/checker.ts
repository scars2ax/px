import axios, { AxiosError } from "axios";
import { KeyCheckerBase } from "../key-checker-base";
import type { AwsBedrockKey, AwsBedrockKeyProvider } from "./provider";

const MIN_CHECK_INTERVAL = 3 * 1000; // 3 seconds
const KEY_CHECK_PERIOD = 60 * 60 * 1000; // 1 hour
const POST_INVOKE_MODEL_URL = (region: string, model: string) =>
  `https://bedrock.${region}.amazonaws.com/model/${model}/invoke`;
const GET_CALLER_IDENTITY_URL = `https://sts.amazonaws.com/?Action=GetCallerIdentity&Version=2011-06-15`;
const GET_INVOCATION_LOGGING_CONFIG_URL = (region: string) =>
  `https://bedrock.${region}.amazonaws.com/logging/modelinvocations`;

type AwsError = { error: {} };

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
    // It's possible this key might have been disabled while we were waiting
    // for the next check.
    if (key.isDisabled) {
      this.log.warn({ key: key.hash }, "Skipping check for disabled key.");
      this.scheduleNextCheck();
      return;
    }

    this.log.debug({ key: key.hash }, "Checking key...");
    let isInitialCheck = !key.lastChecked;
    try {
      // We only need to check for provisioned models on the initial check.
      if (isInitialCheck) {
        // const [provisionedModels, livenessTest] = await Promise.all([
        //   this.getProvisionedModels(key),
        //   this.testLiveness(key),
        //   this.maybeCreateOrganizationClones(key),
        // ]);
        // const updates = {
        //   modelFamilies: provisionedModels,
        //   isTrial: livenessTest.rateLimit <= 250,
        // };
        // this.updateKey(key.hash, updates);
      } else {
        // No updates needed as models and trial status generally don't change.
        // const [_livenessTest] = await Promise.all([this.testLiveness(key)]);
        // this.updateKey(key.hash, {});
      }
      this.log.info(
        { key: key.hash, models: key.modelFamilies, trial: key.isTrial },
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

  private handleAxiosError(key: AwsBedrockKey, error: AxiosError) {
    if (error.response && AwsKeyChecker.errorIsAwsError(error)) {
      return;
    }
    this.log.error(
      { key: key.hash, error: error.message },
      "Network error while checking key; trying this key again in a minute."
    );
    const oneMinute = 60 * 1000;
    const next = Date.now() - (KEY_CHECK_PERIOD - oneMinute);
    this.updateKey(key.hash, { lastChecked: next });
  }

  static errorIsAwsError(error: AxiosError): error is AxiosError<AwsError> {
    const data = error.response?.data as any;
    return data?.error?.type;
  }
}
