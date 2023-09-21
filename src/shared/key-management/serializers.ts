import { APIFormat, Key } from ".";
import { assertNever } from "../utils";
import { KeySerializer } from "./stores";
import { OpenAIKeySerializer } from "./openai/serializer";
import { AnthropicKeySerializer } from "./anthropic/serializer";
import { GooglePalmKeySerializer } from "./palm/serializer";

export function getSerializer(service: APIFormat): KeySerializer<Key> {
  switch (service) {
    case "openai":
    case "openai-text":
      return OpenAIKeySerializer;
    case "anthropic":
      return AnthropicKeySerializer;
    case "google-palm":
      return GooglePalmKeySerializer;
    default:
      assertNever(service);
  }
}
