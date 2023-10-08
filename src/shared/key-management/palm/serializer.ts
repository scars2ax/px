import crypto from "crypto";
import type { GooglePalmKey, SerializedKey } from "../index";
import { KeySerializerBase } from "../serializers";

const SERIALIZABLE_FIELDS: (keyof GooglePalmKey)[] = [
  "key",
  "service",
  "hash",
  "bisonTokens",
];
export type SerializedGooglePalmKey = SerializedKey &
  Partial<Pick<GooglePalmKey, (typeof SERIALIZABLE_FIELDS)[number]>>;

export class GooglePalmKeySerializer extends KeySerializerBase<GooglePalmKey> {
  constructor() {
    super(SERIALIZABLE_FIELDS);
  }

  deserialize(serializedKey: SerializedGooglePalmKey): GooglePalmKey {
    const { key, ...rest } = serializedKey;
    return {
      key,
      service: "google-palm" as const,
      modelFamilies: ["bison"],
      isDisabled: false,
      isRevoked: false,
      promptCount: 0,
      lastUsed: 0,
      rateLimitedAt: 0,
      rateLimitedUntil: 0,
      hash: `plm-${crypto
        .createHash("sha256")
        .update(key)
        .digest("hex")
        .slice(0, 8)}`,
      lastChecked: 0,
      bisonTokens: 0,
      ...rest,
    };
  }
}
