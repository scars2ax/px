import { Key, KeyProvider, LLMService, Model } from "./types";

export abstract class KeyProvierBase<K extends Key> implements KeyProvider<K> {
  abstract readonly service: LLMService;

  abstract init(): Promise<void>;

  abstract get(model: Model): K;

  abstract list(): Omit<K, "key">[];

  abstract disable(key: K): void;

  abstract update(hash: string, update: Partial<K>): void;

  abstract available(): number;

  abstract incrementUsage(hash: string, model: string, tokens: number): void;

  abstract getLockoutPeriod(model: Model): number;

  abstract markRateLimited(hash: string): void;

  abstract recheck(): void;
}
