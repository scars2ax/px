import { LLMService, Key } from ".";
import { assertNever } from "../utils";
import { KeySerializer } from "./stores";
import { OpenAIKeySerializer } from "./openai/serializer";
import { AnthropicKeySerializer } from "./anthropic/serializer";
import { GooglePalmKeySerializer } from "./palm/serializer";
import { AwsBedrockKeySerializer } from "./aws/serializer";

export function getSerializer(service: LLMService): KeySerializer<Key> {
  switch (service) {
    case "openai":
      return OpenAIKeySerializer;
    case "anthropic":
      return AnthropicKeySerializer;
    case "google-palm":
      return GooglePalmKeySerializer;
    case "aws":
      return AwsBedrockKeySerializer;
    default:
      assertNever(service);
  }
}
