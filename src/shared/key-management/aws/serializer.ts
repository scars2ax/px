import crypto from "crypto";
import type { AwsBedrockKey, SerializedKey } from "../index";
import { KeySerializerBase } from "../key-serializer-base";

const SERIALIZABLE_FIELDS: (keyof AwsBedrockKey)[] = [
  "key",
  "service",
  "hash",
  "promptCount",
  "aws-claudeTokens",
];
export type SerializedAwsBedrockKey = SerializedKey &
  Partial<Pick<AwsBedrockKey, (typeof SERIALIZABLE_FIELDS)[number]>>;

export class AwsBedrockKeySerializer extends KeySerializerBase<AwsBedrockKey> {
  constructor() {
    super(SERIALIZABLE_FIELDS);
  }

  deserialize(serializedKey: SerializedAwsBedrockKey): AwsBedrockKey {
    const { key, ...rest } = serializedKey;
    return {
      key,
      service: "aws",
      modelFamilies: ["aws-claude"],
      isDisabled: false,
      isRevoked: false,
      promptCount: 0,
      lastUsed: 0,
      rateLimitedAt: 0,
      rateLimitedUntil: 0,
      awsLoggingStatus: "unknown",
      hash: `aws-${crypto
        .createHash("sha256")
        .update(key)
        .digest("hex")
        .slice(0, 8)}`,
      lastChecked: 0,
      ["aws-claudeTokens"]: 0,
      ...rest,
    };
  }
}
