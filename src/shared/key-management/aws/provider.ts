import { config } from "../../../config";
import { logger } from "../../../logger";
import type { AwsBedrockModelFamily } from "../../models";
import { KeyProviderBase } from "../key-provider-base";
import { Key } from "../types";
import { AwsKeyChecker } from "./checker";

const RATE_LIMIT_LOCKOUT = 2000;
const KEY_REUSE_DELAY = 500;

// https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids-arns.html
export const AWS_BEDROCK_SUPPORTED_MODELS = [
  "anthropic.claude-v1",
  "anthropic.claude-v2",
  "anthropic.claude-instant-v1",
] as const;
export type AwsBedrockModel = (typeof AWS_BEDROCK_SUPPORTED_MODELS)[number];

type AwsBedrockKeyUsage = {
  [K in AwsBedrockModelFamily as `${K}Tokens`]: number;
};

export interface AwsBedrockKey extends Key, AwsBedrockKeyUsage {
  readonly service: "aws";
  readonly modelFamilies: AwsBedrockModelFamily[];
  /** The time at which this key was last rate limited. */
  rateLimitedAt: number;
  /** The time until which this key is rate limited. */
  rateLimitedUntil: number;
  /**
   * The confirmed logging status of this key. This is "unknown" until we
   * receive a response from the AWS API. Keys which are logged, or not
   * confirmed as not being logged, won't be used unless ALLOW_AWS_LOGGING is
   * set.
   */
  awsLoggingStatus: "unknown" | "disabled" | "enabled";
}

export class AwsBedrockKeyProvider extends KeyProviderBase<AwsBedrockKey> {
  readonly service = "aws" as const;

  protected readonly keys: AwsBedrockKey[] = [];
  private checker?: AwsKeyChecker;
  protected log = logger.child({ module: "key-provider", service: this.service });

  public async init() {
    const storeName = this.store.constructor.name;
    const loadedKeys = await this.store.load();

    if (loadedKeys.length === 0) {
      return this.log.warn({ via: storeName }, "No AWS credentials found.");
    }

    this.keys.push(...loadedKeys);
    this.log.info(
      { count: this.keys.length, via: storeName },
      "Loaded AWS Bedrock keys."
    );

    if (config.checkKeys) {
      this.checker = new AwsKeyChecker(this.keys, this.update.bind(this));
      this.checker.start();
    }
  }

  public get(_model: AwsBedrockModel) {
    const availableKeys = this.keys.filter((k) => {
      const isNotLogged = k.awsLoggingStatus === "disabled";
      return !k.isDisabled && (isNotLogged || config.allowAwsLogging);
    });
    if (availableKeys.length === 0) {
      throw new Error("No AWS Bedrock keys available");
    }

    // (largely copied from the OpenAI provider, without trial key support)
    // Select a key, from highest priority to lowest priority:
    // 1. Keys which are not rate limited
    //    a. If all keys were rate limited recently, select the least-recently
    //       rate limited key.
    // 3. Keys which have not been used in the longest time

    const now = Date.now();

    const keysByPriority = availableKeys.sort((a, b) => {
      const aRateLimited = now - a.rateLimitedAt < RATE_LIMIT_LOCKOUT;
      const bRateLimited = now - b.rateLimitedAt < RATE_LIMIT_LOCKOUT;

      if (aRateLimited && !bRateLimited) return 1;
      if (!aRateLimited && bRateLimited) return -1;
      if (aRateLimited && bRateLimited) {
        return a.rateLimitedAt - b.rateLimitedAt;
      }

      return a.lastUsed - b.lastUsed;
    });

    const selectedKey = keysByPriority[0];
    selectedKey.lastUsed = now;
    selectedKey.rateLimitedAt = now;
    // Intended to throttle the queue processor as otherwise it will just
    // flood the API with requests and we want to wait a sec to see if we're
    // going to get a rate limit error on this key.
    selectedKey.rateLimitedUntil = now + KEY_REUSE_DELAY;
    return { ...selectedKey };
  }

  public incrementUsage(hash: string, _model: string, tokens: number) {
    const key = this.keys.find((k) => k.hash === hash);
    if (!key) return;
    key.promptCount++;
    key["aws-claudeTokens"] += tokens;
  }

  public getLockoutPeriod(_model: AwsBedrockModel) {
    // TODO: same exact behavior for three providers, should be refactored
    const activeKeys = this.keys.filter((k) => !k.isDisabled);
    // Don't lock out if there are no keys available or the queue will stall.
    // Just let it through so the add-key middleware can throw an error.
    if (activeKeys.length === 0) return 0;

    const now = Date.now();
    const rateLimitedKeys = activeKeys.filter((k) => now < k.rateLimitedUntil);
    const anyNotRateLimited = rateLimitedKeys.length < activeKeys.length;

    if (anyNotRateLimited) return 0;

    // If all keys are rate-limited, return time until the first key is ready.
    return Math.min(...activeKeys.map((k) => k.rateLimitedUntil - now));
  }

  /**
   * This is called when we receive a 429, which means there are already five
   * concurrent requests running on this key. We don't have any information on
   * when these requests will resolve, so all we can do is wait a bit and try
   * again. We will lock the key for 2 seconds after getting a 429 before
   * retrying in order to give the other requests a chance to finish.
   */
  public markRateLimited(keyHash: string) {
    this.log.debug({ key: keyHash }, "Key rate limited");
    const key = this.keys.find((k) => k.hash === keyHash)!;
    const now = Date.now();
    key.rateLimitedAt = now;
    key.rateLimitedUntil = now + RATE_LIMIT_LOCKOUT;
  }

  public recheck() {
    this.keys.forEach(({ hash }) =>
      this.update(hash, { lastChecked: 0, isDisabled: false })
    );
  }
}
