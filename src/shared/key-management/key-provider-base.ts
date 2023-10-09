import { logger } from "../../logger";
import { Key, KeyStore, LLMService, Model } from "./types";

export abstract class KeyProviderBase<K extends Key = Key> {
  public abstract readonly service: LLMService;

  protected abstract readonly keys: K[];
  protected abstract log: typeof logger;
  protected readonly store: KeyStore<K>;

  public constructor(keyStore: KeyStore<K>) {
    this.store = keyStore;
  }

  public abstract init(): Promise<void>;

  public addKey(key: K): void {
    this.keys.push(key);
    this.store.add(key);
  }

  public abstract get(model: Model): K;

  /**
   * Returns a list of all keys, with the actual key value removed. Don't
   * mutate the returned objects; use `update` instead to ensure the changes
   * are synced to the key store.
   */
  public list(): Omit<K, "key">[] {
    return this.keys.map((k) => Object.freeze({ ...k, key: undefined }));
  }

  public disable(key: K): void {
    const keyFromPool = this.keys.find((k) => k.hash === key.hash);
    if (!keyFromPool || keyFromPool.isDisabled) return;
    this.update(key.hash, { isDisabled: true } as Partial<K>, true);
    this.log.warn({ key: key.hash }, "Key disabled");
  }

  public update(hash: string, update: Partial<K>, force = false): void {
    const key = this.keys.find((k) => k.hash === hash);
    if (!key) {
      throw new Error(`No key with hash ${hash}`);
    }

    Object.assign(key, { lastChecked: Date.now(), ...update });
    this.store.update(hash, update, force);
  }

  public available(): number {
    return this.keys.filter((k) => !k.isDisabled).length;
  }

  public abstract incrementUsage(
    hash: string,
    model: string,
    tokens: number
  ): void;

  public abstract getLockoutPeriod(model: Model): number;

  public abstract markRateLimited(hash: string): void;

  public abstract recheck(): void;
}
