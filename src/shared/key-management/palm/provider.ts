import { logger } from "../../../logger";
import type { GooglePalmModelFamily } from "../../models";
import { Key, KeyProvider, KeyStore } from "../types";

const RATE_LIMIT_LOCKOUT = 2000;
const KEY_REUSE_DELAY = 500;

// https://developers.generativeai.google.com/models/language
export const GOOGLE_PALM_SUPPORTED_MODELS = ["text-bison-001"] as const;
export type GooglePalmModel = (typeof GOOGLE_PALM_SUPPORTED_MODELS)[number];

type GooglePalmKeyUsage = {
  [K in GooglePalmModelFamily as `${K}Tokens`]: number;
};

export interface GooglePalmKey extends Key, GooglePalmKeyUsage {
  readonly service: "google-palm";
  readonly modelFamilies: GooglePalmModelFamily[];
  /** The time at which this key was last rate limited. */
  rateLimitedAt: number;
  /** The time until which this key is rate limited. */
  rateLimitedUntil: number;
}

export class GooglePalmKeyProvider implements KeyProvider<GooglePalmKey> {
  readonly service = "google-palm";

  private keys: GooglePalmKey[] = [];
  private store: KeyStore<GooglePalmKey>;
  private log = logger.child({ module: "key-provider", service: this.service });

  constructor(store: KeyStore<GooglePalmKey>) {
    this.store = store;
  }

  public async init() {
    const storeName = this.store.constructor.name;
    const loadedKeys = await this.store.load();

    if (loadedKeys.length === 0) {
      return this.log.warn({ via: storeName }, "No Google PaLM keys found.");
    }

    this.keys.push(...loadedKeys);
    this.log.info(
      { count: this.keys.length, via: storeName },
      "Loaded PaLM keys."
    );
  }

  public list() {
    return this.keys.map((k) => Object.freeze({ ...k, key: undefined }));
  }

  public get(_model: GooglePalmModel) {
    const availableKeys = this.keys.filter((k) => !k.isDisabled);
    if (availableKeys.length === 0) {
      throw new Error("No Google PaLM keys available");
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

  public disable(key: GooglePalmKey) {
    const keyFromPool = this.keys.find((k) => k.hash === key.hash);
    if (!keyFromPool || keyFromPool.isDisabled) return;
    keyFromPool.isDisabled = true;
    this.log.warn({ key: key.hash }, "Key disabled");
  }

  public update(hash: string, update: Partial<GooglePalmKey>) {
    const keyFromPool = this.keys.find((k) => k.hash === hash)!;
    Object.assign(keyFromPool, { lastChecked: Date.now(), ...update });
  }

  public available() {
    return this.keys.filter((k) => !k.isDisabled).length;
  }

  public incrementUsage(hash: string, _model: string, tokens: number) {
    const key = this.keys.find((k) => k.hash === hash);
    if (!key) return;
    key.promptCount++;
    key.bisonTokens += tokens;
  }

  public getLockoutPeriod(_model: GooglePalmModel) {
    const activeKeys = this.keys.filter((k) => !k.isDisabled);
    // Don't lock out if there are no keys available or the queue will stall.
    // Just let it through so the add-key middleware can throw an error.
    if (activeKeys.length === 0) return 0;

    const now = Date.now();
    const rateLimitedKeys = activeKeys.filter((k) => now < k.rateLimitedUntil);
    const anyNotRateLimited = rateLimitedKeys.length < activeKeys.length;

    if (anyNotRateLimited) return 0;

    // If all keys are rate-limited, return the time until the first key is
    // ready.
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

  public recheck() {}
}
