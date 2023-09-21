import crypto from "crypto";
import { GooglePalmKey } from "..";
import { KeySerializer } from "../stores";
import { SerializedGooglePalmKey } from "./provider";

export const GooglePalmKeySerializer: KeySerializer<GooglePalmKey> = {
  serialize(key: GooglePalmKey): SerializedGooglePalmKey {
    return { key: key.key };
  },
  deserialize(serializedKey: SerializedGooglePalmKey): GooglePalmKey {
    const { key, ...rest } = serializedKey;
    return {
      key,
      service: "google-palm" as const,
      modelFamilies: ["bison"],
      isTrial: false,
      isDisabled: false,
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
  },
};
