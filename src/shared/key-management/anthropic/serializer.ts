import crypto from "crypto";
import { AnthropicKey } from "..";
import { KeySerializer } from "../stores";
import { SerializedAnthropicKey } from "./provider";

export const AnthropicKeySerializer: KeySerializer<AnthropicKey> = {
  serialize(key: AnthropicKey): SerializedAnthropicKey {
    return { key: key.key }; // TODO: serialize other fields
  },
  deserialize({ key, ...rest }: SerializedAnthropicKey): AnthropicKey {
    return {
      key,
      service: "anthropic" as const,
      modelFamilies: ["claude" as const],
      isTrial: false,
      isDisabled: false,
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
  },
};
