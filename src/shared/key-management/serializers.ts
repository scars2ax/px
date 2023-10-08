import { assertNever } from "../utils";
import { Key, LLMService, ServiceToKey } from "./index";
import { OpenAIKeySerializer } from "./openai/serializer";
import { AnthropicKeySerializer } from "./anthropic/serializer";
import { GooglePalmKeySerializer } from "./palm/serializer";
import { AwsBedrockKeySerializer } from "./aws/serializer";

export type SerializedKey = { key: string };

export interface KeySerializer<K> {
  serialize(keyObj: K): SerializedKey;
  deserialize(serializedKey: SerializedKey): K;
  partialSerialize(key: string, update: Partial<K>): Partial<SerializedKey>;
}

export abstract class KeySerializerBase<K extends Key>
  implements KeySerializer<K>
{
  protected constructor(protected serializableFields: (keyof K)[]) {}

  serialize(keyObj: K): SerializedKey {
    return {
      ...Object.fromEntries(this.serializableFields.map((f) => [f, keyObj[f]])),
      key: keyObj.key,
    };
  }

  partialSerialize(key: string, update: Partial<K>): Partial<SerializedKey> {
    return {
      ...Object.fromEntries(this.serializableFields.map((f) => [f, update[f]])),
      key,
    };
  }

  abstract deserialize(serializedKey: SerializedKey): K;
}

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
