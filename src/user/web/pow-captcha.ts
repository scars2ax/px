import argon2 from "argon2";
import crypto from "crypto";
import express from "express";
import { z } from "zod";
import { createUser, upsertUser } from "../shared/users/user-store";
import { config, POW_HMAC_KEY } from "../config";

/** Number of leading zeros required for a valid solution */
const CHALLENGE_DIFFICULTY = 8;
/** Expiry time for a challenge in milliseconds */
const POW_EXPIRY = 1000 * 60 * 15; // 15 minutes
/** Lockout time after failed verification in milliseconds */
const LOCKOUT_TIME = 1000 * 60; // 1 minute
// Argon2 parameters, may be adjusted dynamically depending on resource usage
const ARGON2_HASH_LENGTH = 32;
const ARGON2_TIME_COST = 3;
const ARGON2_MEMORY = 4096;
const ARGON2_PARALLELISM = 4;
const ARGON2_TYPE = argon2.argon2id;

type Challenge = {
  /** Salt */
  s: string;
  /** Argon2 hash length */
  hl: number;
  /** Argon2 time cost */
  t: number;
  /** Argon2 memory cost */
  m: number;
  /** Argon2 parallelism */
  p: number;
  /** Argon2 algorithm */
  at: number;
  /** Difficulty (number of leading zeros) */
  d: number;
  /** Expiry time in milliseconds */
  e: number;
  /** IP address of the client */
  ip?: string;
  /** Challenge version */
  v?: number;
};

const verifySchema = z.object({
  challenge: z.object({
    s: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[0-9a-f]+$/),
    hl: z.number().int().positive().max(64),
    t: z.number().int().positive().max(10),
    m: z.number().int().positive().max(65536),
    p: z.number().int().positive().max(16),
    at: z.number().int().positive().min(0).max(2),
    d: z.number().int().positive().max(32),
    e: z.number().int().positive(),
    ip: z.string().min(1).max(64).optional(),
    v: z.literal(1),
  }),
  solution: z.string().min(1).max(64),
  signature: z.string().min(1),
});

/** Solutions by timestamp */
const solves = new Map<string, number>();
/** Recent attempts by IP address */
const recentAttempts = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamp] of recentAttempts) {
    if (now - timestamp > LOCKOUT_TIME) {
      recentAttempts.delete(ip);
    }
  }

  for (const [key, timestamp] of solves) {
    if (now - timestamp > POW_EXPIRY) {
      solves.delete(key);
    }
  }
}, 1000);

function generateChallenge(clientIp?: string): Challenge {
  return {
    s: crypto.randomBytes(64).toString("hex"),
    hl: ARGON2_HASH_LENGTH,
    t: ARGON2_TIME_COST,
    m: ARGON2_MEMORY,
    p: ARGON2_PARALLELISM,
    at: ARGON2_TYPE,
    d: CHALLENGE_DIFFICULTY,
    e: Date.now() + POW_EXPIRY,
    ip: clientIp,
  };
}

function signMessage(msg: any): string {
  const hmac = crypto.createHmac("sha256", POW_HMAC_KEY);
  if (typeof msg === "object") {
    hmac.update(JSON.stringify(msg));
  } else {
    hmac.update(msg);
  }
  return hmac.digest("hex");
}

async function verifySolution(
  challenge: Challenge,
  solution: string
): Promise<boolean> {
  const hash = await argon2.hash(solution, {
    salt: Buffer.from(challenge.s, "hex"),
    hashLength: challenge.hl,
    timeCost: challenge.t,
    memoryCost: challenge.m,
    parallelism: challenge.p,
    type: challenge.at as 0 | 1 | 2,
  });
  return hash.slice(0, challenge.d) === "0".repeat(challenge.d);
}

const router = express.Router();
router.get("/challenge", (req, res) => {
  const challenge = generateChallenge(req.ip);
  const signature = signMessage(challenge);
  res.json({ challenge, signature });
});

router.post("/verify", async (req, res) => {
  const ip = req.ip;
  if (recentAttempts.has(ip)) {
    res
      .status(429)
      .json({ error: "Rate limited; wait a minute before trying again" });
    return;
  }

  const result = verifySchema.safeParse(req.body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: "Invalid verify request", details: result.error });
    return;
  }

  const { challenge, solution, signature } = result.data;
  if (signMessage(challenge) !== signature) {
    res
      .status(400)
      .json({ error: "Invalid signature; please request a new challenge" });
    return;
  }

  if (challenge.ip && challenge.ip !== ip) {
    res.status(400).json({
      error: "Solution must be verified from the original IP address",
    });
    return;
  }

  if (solves.has(signature)) {
    res.status(400).json({ error: "Challenge already solved" });
    return;
  }

  if (Date.now() > challenge.e) {
    res.status(400).json({ error: "Challenge expired" });
    return;
  }

  recentAttempts.set(ip, Date.now());
  const success = await verifySolution(challenge, solution);
  if (!success) {
    res
      .status(400)
      .json({ error: "Invalid solution" });
    return;
  }

  solves.set(signature, Date.now());

  const token = createUser({
    type: "temporary",
    expiresAt: Date.now() + config.captchaTokenHours * 60 * 60 * 1000,
  });
  req.log.info({ ip, token: `...${token.slice(-5)}` }, "Captcha token issued");
  upsertUser({ token, ip: [ip], maxIps: config.captchaTokenMaxIps });

  res.json({ token });
  // TODO: Issue jwt to let user refresh temp token or rebind IP
});

export { router as powCaptchaRouter };
