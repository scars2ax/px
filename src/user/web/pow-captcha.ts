import crypto from "crypto";
import express from "express";
import argon2 from "@node-rs/argon2";
import { z } from "zod";
import { createUser, upsertUser } from "../../shared/users/user-store";
import { config, POW_HMAC_KEY } from "../../config";

/** Expiry time for a challenge in milliseconds */
const POW_EXPIRY = 1000 * 60 * 60; // 1 hour
/** Lockout time after failed verification in milliseconds */
const LOCKOUT_TIME = 1000 * 30; // 30 seconds

type ProofOfWorkConfig = {
  /**
   * Argon2 output length in bytes. This is the length of the hash that will be
   * compared against the challenge target.
   */
  ARGON2_HASH_LENGTH: number;
  /**
   * Argon2 hash iterations. Larger values directly increase the time to
   * compute the hash.
   */
  ARGON2_TIME_COST: number;
  /**
   * Argon2 memory cost in kilobytes. Larger values make it harder to
   * parallelize and take longer to compute but may cause thrashing. Low-
   * memory devices may not be able to handle large values.
   *
   * This is per-thread, so multiply by parallelism to get the total memory.
   */
  ARGON2_MEMORY_KB: number;
  /**
   * Argon2 degree of parallelism. Recommended to keep this low to avoid
   * slowing down older devices.
   */
  ARGON2_PARALLELISM: number;
  /**
   * Work factor for the challenge. This is the expected number of hashes that
   * will be computed to solve the challenge, on average. The actual number of
   * hashes will vary due to randomness.
   */
  WORK_FACTOR: number;
};

const levels: Record<string, ProofOfWorkConfig> = {
  extreme: {
    ARGON2_TIME_COST: 6,
    ARGON2_MEMORY_KB: 1024 * 64,
    ARGON2_PARALLELISM: 4,
    WORK_FACTOR: 1000,
    ARGON2_HASH_LENGTH: 32,
  },
  high: {
    ARGON2_TIME_COST: 6,
    ARGON2_MEMORY_KB: 1024 * 64,
    ARGON2_PARALLELISM: 4,
    WORK_FACTOR: 500,
    ARGON2_HASH_LENGTH: 32,
  },
  medium: {
    ARGON2_TIME_COST: 6,
    ARGON2_MEMORY_KB: 1024 * 64,
    ARGON2_PARALLELISM: 4,
    WORK_FACTOR: 200,
    ARGON2_HASH_LENGTH: 32,
  },
  low: {
    ARGON2_TIME_COST: 6,
    ARGON2_MEMORY_KB: 1024 * 64,
    ARGON2_PARALLELISM: 4,
    WORK_FACTOR: 25,
    ARGON2_HASH_LENGTH: 32,
  },
};

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
  /** Challenge target value (difficulty) */
  d: string;
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
    t: z.number().int().positive().min(2).max(10),
    m: z.number().int().positive().max(65536),
    p: z.number().int().positive().max(16),
    d: z.string().regex(/^[0-9]+n$/),
    e: z.number().int().positive(),
    ip: z.string().min(1).max(64).optional(),
    v: z.literal(1).optional(),
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
  const difficulty = levels[config.captchaPoWDifficultyLevel];
  const hashBits = BigInt(difficulty.ARGON2_HASH_LENGTH) * 8n;
  const hashMax = 2n ** hashBits;
  const targetValue = hashMax / BigInt(difficulty.WORK_FACTOR);

  return {
    s: crypto.randomBytes(32).toString("hex"),
    hl: difficulty.ARGON2_HASH_LENGTH,
    t: difficulty.ARGON2_TIME_COST,
    m: difficulty.ARGON2_MEMORY_KB,
    p: difficulty.ARGON2_PARALLELISM,
    d: targetValue.toString() + "n",
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
  solution: string,
  logger: any
): Promise<boolean> {
  logger.info({ solution, challenge }, "Verifying solution");
  const hash = await argon2.hashRaw(String(solution), {
    salt: Buffer.from(challenge.s, "hex"),
    outputLen: challenge.hl,
    timeCost: challenge.t,
    memoryCost: challenge.m,
    parallelism: challenge.p,
    algorithm: argon2.Algorithm.Argon2id,
  });
  const hashStr = hash.toString("hex");
  const target = BigInt(challenge.d.slice(0, -1));
  const hashValue = BigInt("0x" + hashStr);
  const result = hashValue <= target;
  logger.info({ hashStr, target, hashValue, result }, "Solution verified");
  return result;
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

  const { challenge, signature, solution } = result.data;
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
  try {
    const success = await verifySolution(challenge, solution, req.log);
    if (!success) {
      res.status(400).json({ error: "Invalid solution" });
      return;
    }
    solves.set(signature, Date.now());
  } catch (err) {
    req.log.error(err, "Error verifying solution");
    res.status(500).json({ error: "Internal error" });
    return;
  }

  const token = createUser({
    type: "temporary",
    expiresAt: Date.now() + config.captchaTokenHours * 60 * 60 * 1000,
  });
  req.log.info({ ip, token: `...${token.slice(-5)}` }, "Captcha token issued");
  upsertUser({ token, ip: [ip], maxIps: config.captchaTokenMaxIps });

  res.json({ token });
  // TODO: Issue jwt to let user refresh temp token or rebind IP
});

router.get("/", (_req, res) => {
  res.render("user_request_token", {
    tokenLifetime: config.captchaTokenHours,
    tokenMaxIps: config.captchaTokenMaxIps,
  });
});

export { router as powCaptchaRouter };
