import { AnthropicKeyProvider } from "./anthropic/provider";
import { Key, AIService, Model, KeyProvider } from "./index";
import { OpenAIKeyProvider } from "./openai/provider";

export interface KeyPool {
  /** Initialize the key pool. */
  init(): void;
  /** Gets a key for the given model. */
  get(model: Model): Key;
  /** List status of all keys in the pool. */
  list(): Omit<Key, "key">[];
  /** Disable a key. */
  disable(key: Key): void;
  /** Number of active keys in the pool. */
  available(): number;
  /** Whether any key providers are still checking key status. */
  anyUnchecked(): boolean;
  /** Time until the key pool will be able to fulfill a request for a model.*/
  getLockoutPeriod(model: Model): number;
  /** Remaining aggregate quota for the key pool as a percentage. */
  remainingQuota(service: AIService): number;
  /** Used over available usage in USD. */
  usageInUsd(service: AIService): string;
}

// TODO: this will never have subclasses or other implementations so the TS
// interface is unnecessary.

export class KeyPool implements KeyPool {
  private keyProviders: KeyProvider[] = [];

  constructor() {}

  public init() {
    this.keyProviders.forEach((provider) => provider.init());

    // TODO: Ensure at least a single key is available across any provider,
    // otherwise the server should not start.
    // Remove thrown exceptions from init methods as not all providers will be
    // used in a given deployment.
  }

  public get(model: Model): Key {
    // TODO: Delegate to the appropriate provider. Need some way to map model
    // prefixes to provider classes.
    return this.keyProviders[0].get(model);
  }

  public list(): Omit<Key, "key">[] {
    return this.keyProviders.flatMap((provider) => provider.list());
  }

  public disable(key: Key): void {
    const service = this.getKeyProvider(key.service);
  }

  // TODO: this probably needs to be scoped to a specific provider. I think the
  // only code calling this is the error handler which needs to know how many
  // more keys are available for the provider the user tried to use.
  public available(): number {
    return this.keyProviders.reduce(
      (sum, provider) => sum + provider.available(),
      0
    );
  }

  public anyUnchecked(): boolean {
    return this.keyProviders.some((provider) => provider.anyUnchecked());
  }

  public getLockoutPeriod(model: Model): number {
    const service = this.getService(model);
    return this.getKeyProvider(service).getLockoutPeriod(model);
  }

  public remainingQuota(service: AIService): number {
    return this.getKeyProvider(service).remainingQuota();
  }

  public usageInUsd(service: AIService): string {
    return this.getKeyProvider(service).usageInUsd();
  }

  // TODO: define regex for model prefixes and use that to determine which
  // provider to service
  private getService(model: Model): AIService {
    if (model.startsWith("gpt")) {
      return "openai";
    } else if (model.startsWith("claude")) {
      return "anthropic";
    }
    throw new Error(`Unknown service for model ${model}`);
  }

  private getKeyProvider(service: AIService): KeyProvider {
    return this.keyProviders.find((provider) => provider.service === service)!;
  }
}
