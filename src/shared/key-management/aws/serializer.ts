import crypto from "crypto";
import { AwsBedrockKey } from "..";
import { KeySerializer } from "../stores";
import { SerializedAwsBedrockKey } from "./provider";

export const AwsBedrockKeySerializer: KeySerializer<AwsBedrockKey> = {
  serialize(key: AwsBedrockKey): SerializedAwsBedrockKey {
    return { key: key.key };
  },
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
      hash: `plm-${crypto
        .createHash("sha256")
        .update(key)
        .digest("hex")
        .slice(0, 8)}`,
      lastChecked: 0,
      ["aws-claudeTokens"]: 0,
      ...rest,
    };
  },
};
