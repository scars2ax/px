import crypto from "crypto";
import type { AnthropicKey, SerializedKey } from "../index";
import { KeySerializerBase } from "../key-serializer-base";

const SERIALIZABLE_FIELDS: (keyof AnthropicKey)[] = [
  "key",
  "service",
  "hash",
  "promptCount",
  "claudeTokens",
];
export type SerializedAnthropicKey = SerializedKey &
  Partial<Pick<AnthropicKey, (typeof SERIALIZABLE_FIELDS)[number]>>;

export class AnthropicKeySerializer extends KeySerializerBase<AnthropicKey> {
  constructor() {
    super(SERIALIZABLE_FIELDS);
  }

  deserialize({ key, ...rest }: SerializedAnthropicKey): AnthropicKey {
    return {
      key,
      service: "anthropic" as const,
      modelFamilies: ["claude" as const],
      isDisabled: false,
      isRevoked: false,
      isPozzed: false,
      promptCount: 0,
      lastUsed: 0,
      rateLimitedAt: 0,
      rateLimitedUntil: 0,
      requiresPreamble: false,
      hash: `ant-${crypto
        .createHash("sha256")
        .update(key)
        .digest("hex")
        .slice(0, 8)}`,
      lastChecked: 0,
      claudeTokens: 0,
      ...rest,
    };
  }
}
