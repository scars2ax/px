import { assertNever } from "../utils";
import { OpenAIKeySerializer } from "./openai/serializer";
import { AnthropicKeySerializer } from "./anthropic/serializer";
import { GooglePalmKeySerializer } from "./palm/serializer";
import { AwsBedrockKeySerializer } from "./aws/serializer";
import {
  Key,
  KeySerializer,
  LLMService,
  SerializedKey,
  ServiceToKey,
} from "./types";

export function assertSerializedKey(k: any): asserts k is SerializedKey {
  if (typeof k !== "object" || !k || typeof (k as any).key !== "string") {
    throw new Error("Invalid serialized key data");
  }
}

export function getSerializer<S extends LLMService>(
  service: S
): KeySerializer<ServiceToKey[S]>;
export function getSerializer(service: LLMService): KeySerializer<Key> {
  switch (service) {
    case "openai":
      return new OpenAIKeySerializer();
    case "anthropic":
      return new AnthropicKeySerializer();
    case "google-palm":
      return new GooglePalmKeySerializer();
    case "aws":
      return new AwsBedrockKeySerializer();
    default:
      assertNever(service);
  }
}
