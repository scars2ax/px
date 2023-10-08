import type { OpenAIKey, OpenAIModel } from "./openai/provider";
import type { AnthropicKey, AnthropicModel } from "./anthropic/provider";
import type { GooglePalmKey, GooglePalmModel } from "./palm/provider";
import type { AwsBedrockKey, AwsBedrockModel } from "./aws/provider";
import type { ModelFamily } from "../models";

/** The request and response format used by a model's API. */
export type APIFormat = "openai" | "anthropic" | "google-palm" | "openai-text";
/**
 * The service that a model is hosted on; distinct because services like AWS
 * provide APIs from other service providers, but have their own authentication
 * and key management.
 */
export type LLMService = "openai" | "anthropic" | "google-palm" | "aws";

export type Model =
  | OpenAIModel
  | AnthropicModel
  | GooglePalmModel
  | AwsBedrockModel;

type AllKeys = OpenAIKey | AnthropicKey | GooglePalmKey | AwsBedrockKey;
export type ServiceToKey = {
  [K in AllKeys["service"]]: Extract<AllKeys, { service: K }>;
};
export type SerializedKey = { key: string };

export interface Key {
  /** The API key itself. Never log this, use `hash` instead. */
  readonly key: string;
  /** The service that this key is for. */
  service: LLMService;
  /** The model families that this key has access to. */
  modelFamilies: ModelFamily[];
  /** Whether this key is currently disabled, meaning its quota has been exceeded or it has been revoked. */
  isDisabled: boolean;
  /** Whether this key specifically has been revoked. */
  isRevoked: boolean;
  /** The number of prompts that have been sent with this key. */
  promptCount: number;
  /** The time at which this key was last used. */
  lastUsed: number;
  /** The time at which this key was last checked. */
  lastChecked: number;
  /** Hash of the key, for logging and to find the key in the pool. */
  hash: string;
}

export interface KeyProvider<T extends Key = Key> {
  readonly service: LLMService;

  init(): Promise<void>;

  get(model: Model): T;

  list(): Omit<T, "key">[];

  disable(key: T): void;

  update(hash: string, update: Partial<T>): void;

  available(): number;

  incrementUsage(hash: string, model: string, tokens: number): void;

  getLockoutPeriod(model: Model): number;

  markRateLimited(hash: string): void;

  recheck(): void;
}

export interface KeySerializer<K> {
  serialize(keyObj: K): SerializedKey;

  deserialize(serializedKey: SerializedKey): K;

  partialSerialize(key: string, update: Partial<K>): Partial<SerializedKey>;
}

export interface KeyStore<K extends Key> {
  load(): Promise<K[]>;

  add(key: K): void;

  update(id: string, update: Partial<K>, force?: boolean): void;
}
