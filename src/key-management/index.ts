import { OpenAIKeyPool } from "./openai/key-pool";
import { OPENAI_SUPPORTED_MODELS } from "./openai/key-pool";

export type Model = OpenAIModel | AnthropicModel;
export type OpenAIModel = "gpt-3.5-turbo" | "gpt-4";
export type AnthropicModel = "claude-v1" | "claude-instant-v1";

export interface Key {
  /** The API key itself. */
  key: string;
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

export interface KeyPool<T extends Key = never> {
  /** Initialize the key pool. */
  init(): void;
  /** Get a key from the pool. */
  get(model: Model): T;
  /** List status of all keys in the pool. */
  list(): Omit<T, "key">[];
  /** Disable a key. */
  disable(key: T): void;
  /** Number of keys in the pool. */
  available(): number;
  /** Whether the key pool is still checking key status. */
  anyUnchecked(): boolean;
  /** The time until the key pool will be able to fulfill another request. */
  getLockoutPeriod(model: Model): number;
  /** Get remaining aggregate quota for the key pool as a percentage. */
  remainingQuota(): number;
  /** Get used over available usage in USD. */
  usageInUsd(): string;
}

export const keyPool = new OpenAIKeyPool();
export const SUPPORTED_MODELS = OPENAI_SUPPORTED_MODELS;
