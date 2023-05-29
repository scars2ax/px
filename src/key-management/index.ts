import {
  OPENAI_SUPPORTED_MODELS,
  OpenAIKeyProvider,
  OpenAIModel,
} from "./openai/provider";
import {
  ANTHROPIC_SUPPORTED_MODELS,
  AnthropicKeyProvider,
  AnthropicModel,
} from "./anthropic/provider";

type AIService = "openai" | "anthropic";
export type Model = OpenAIModel | AnthropicModel;

export interface Key {
  /** The API key itself. */
  key: string;
  /** The provider that this key belongs to. */
  provider: AIService;
  /** Whether this is a free trial key. These are prioritized over paid keys if they can fulfill the request. */
  isTrial: boolean;
  /** Whether this key has been provisioned for GPT-4. */
  isGpt4: boolean;
  /** Whether this key is currently disabled, meaning its quota has been exceeded or it has been revoked. */
  isDisabled: boolean;
  /** The number of prompts that have been sent with this key. */
  promptCount: number;
  /** The time at which this key was last used. */
  lastUsed: number;
  /** The time at which this key was last checked. */
  lastChecked: number;
  /** Key hash for displaying usage in the dashboard. */
  hash: string;
}

/*
KeyPool and KeyProvider's similarities are a relic of the old design where
there was only a single KeyPool for OpenAI keys. Now that there are multiple
supported services, the service-specific functionality has been moved to
KeyProvider and KeyPool is just a wrapper around multiple KeyProviders,
delegating to the appropriate one based on the model requested.

Existing code will continue to call methods on KeyPool, which routes them to
the appropriate KeyProvider or returns data aggregated across all KeyProviders
for service-agnostic functionality.
*/

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

export interface KeyProvider<T extends Key = never> {
  init(): void;
  get(model: Model): T;
  list(): Omit<T, "key">[];
  disable(key: T): void;
  available(): number;
  anyUnchecked(): boolean;
  getLockoutPeriod(model: Model): number;
  remainingQuota(): number;
  usageInUsd(): string;
}

export const keyPool = new OpenAIKeyProvider();
export const SUPPORTED_MODELS = OPENAI_SUPPORTED_MODELS;
