import { AIService, Key } from "..";
import { AnthropicKeyProvider } from "../anthropic/provider";
import { OpenAIKeyProvider } from "../openai/provider";

export { FirebaseKeyStore } from "./firebase";
export { MemoryKeyStore } from "./memory";

export interface KeyStore<T extends Pick<Key, "key">> {
  load(): Promise<T[]>;
  add(key: T): void;
  update(key: T): void;
}

interface BaseSerializableKey {
  key: string;
}

export type KeyDeserializer =
  | typeof AnthropicKeyProvider.deserialize
  | typeof OpenAIKeyProvider.deserialize;

export function getDeserializer(service: AIService): KeyDeserializer {
  switch (service) {
    case "anthropic":
      return AnthropicKeyProvider.deserialize;
    case "openai":
      return OpenAIKeyProvider.deserialize;
    default:
      const never: never = service;
      throw new Error(`Unknown service: ${never}`);
  }
}
