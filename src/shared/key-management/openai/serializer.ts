import crypto from "crypto";
import type { OpenAIKey } from "../index";
import type { KeySerializer, SerializedKey } from "../stores";

const SERIALIZABLE_FIELDS: (keyof OpenAIKey)[] = [
  "key",
  "service",
  "hash",
  "organizationId",
  "gpt4Tokens",
  "gpt4-32kTokens",
  "turboTokens",
];
export type SerializedOpenAIKey = SerializedKey &
  Partial<Pick<OpenAIKey, (typeof SERIALIZABLE_FIELDS)[number]>>;

export const OpenAIKeySerializer: KeySerializer<OpenAIKey> = {
  serialize(key: OpenAIKey): SerializedOpenAIKey {
    return { key: key.key };
  },
  deserialize({ key, ...rest }: SerializedOpenAIKey): OpenAIKey {
    return {
      key,
      service: "openai",
      modelFamilies: ["turbo" as const, "gpt4" as const],
      isTrial: false,
      isDisabled: false,
      isRevoked: false,
      isOverQuota: false,
      lastUsed: 0,
      lastChecked: 0,
      promptCount: 0,
      hash: `oai-${crypto
        .createHash("sha256")
        .update(key)
        .digest("hex")
        .slice(0, 8)}`,
      rateLimitedAt: 0,
      rateLimitRequestsReset: 0,
      rateLimitTokensReset: 0,
      turboTokens: 0,
      gpt4Tokens: 0,
      "gpt4-32kTokens": 0,
      ...rest,
    };
  },
};
