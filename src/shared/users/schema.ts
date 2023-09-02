import { ZodType, z } from "zod";
import type { ModelFamily } from "../models";

const tokenCountsSchema: ZodType<UserTokenCounts> = z
  .object({
    turbo: z.number().optional(),
    gpt4: z.number().optional(),
    "gpt4-32k": z.number().optional(),
    claude: z.number().optional(),
  })
  .refine(zodModelFamilyRefinement, {
    message:
      "If provided, a tokenCounts object must include all model families",
  }) as ZodType<UserTokenCounts>; // refinement ensures the type correctness but zod doesn't know that

export const UserSchema = z
  .object({
    token: z.string(),
    ip: z.array(z.string()),
    nickname: z.string().max(80).nullish(),
    type: z.enum(["normal", "special"]),
    promptCount: z.number(),
    tokenCount: z.any().nullish(), // never used, but remains for compatibility
    tokenCounts: tokenCountsSchema,
    tokenLimits: tokenCountsSchema,
    createdAt: z.number(),
    lastUsedAt: z.number().nullish(),
    disabledAt: z.number().nullish(),
    disabledReason: z.string().nullish(),
  })
  .strict();

export const UserPartialSchema = UserSchema.partial().extend({
  token: z.string(),
});

// gpt4-32k was added after the initial release, so this tries to allow for
// data imported from older versions of the app which may be missing the
// new model family.
// Otherwise, all model families must be present.
function zodModelFamilyRefinement(data: Record<string, number>) {
  const keys = Object.keys(data).sort();
  const validSets = [
    ["claude", "gpt4", "turbo"],
    ["claude", "gpt4", "gpt4-32k", "turbo"],
  ];
  return validSets.some((set) => keys.join(",") === set.join(","));
}

export type UserTokenCounts = {
  [K in Exclude<ModelFamily, "gpt4-32k">]: number;
} & {
  [K in "gpt4-32k"]?: number | null; // null is not quite right but is more strict than undefined with +=
};

// export interface User {
//   /** The user's personal access token. */
//   token: string;
//   /** The user's nickname. */
//   nickname?: string;
//   /** The IP addresses the user has connected from. */
//   ip: string[];
//   /** The user's privilege level. */
//   type: UserType;
//   /** The number of prompts the user has made. */
//   promptCount: number;
//   /** @deprecated Use `tokenCounts` instead. */
//   tokenCount?: never;
//   /** The number of tokens the user has consumed, by model family. */
//   tokenCounts: UserTokenCounts;
//   /** The maximum number of tokens the user can consume, by model family. */
//   tokenLimits: UserTokenCounts;
//   /** The time at which the user was created. */
//   createdAt: number;
//   /** The time at which the user last connected. */
//   lastUsedAt?: number;
//   /** The time at which the user was disabled, if applicable. */
//   disabledAt?: number;
//   /** The reason for which the user was disabled, if applicable. */
//   disabledReason?: string;
// }

type WithNullableOptionals<T> = {
  [prop in keyof T]: undefined extends T[prop] ? T[prop] | null : T[prop];
};
export type User = z.infer<typeof UserSchema>;
export type UserUpdate = z.infer<typeof UserPartialSchema>;

/**
 * Possible privilege levels for a user.
 * - `normal`: Default role. Subject to usual rate limits and quotas.
 * - `special`: Special role. Higher quotas and exempt from auto-ban/lockout.
 */
export type UserType = "normal" | "special";
