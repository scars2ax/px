import { Request, Response, NextFunction } from "express";
import { config } from "../config";

export const AGNAI_DOT_CHAT_IP = "157.230.249.32";

const RATE_LIMIT_ENABLED = Boolean(config.modelRateLimit);
const RATE_LIMIT = Math.max(1, config.modelRateLimit);
const ONE_MINUTE_MS = 60 * 1000;

const lastAttempts = new Map<string, number[]>();

const expireOldAttempts = (now: number) => (attempt: number) =>
  attempt > now - ONE_MINUTE_MS;

const getTryAgainInMs = (ip: string, customLimit: number) => {
  const now = Date.now();
  const attempts = lastAttempts.get(ip) || [];
  const validAttempts = attempts.filter(expireOldAttempts(now));

  if (validAttempts.length >= customLimit) {
    return validAttempts[0] - now + ONE_MINUTE_MS;
  } else {
    lastAttempts.set(ip, [...validAttempts, now]);
    return 0;
  }
};

const getStatus = (ip: string, customLimit: number) => {
  const now = Date.now();
  const attempts = lastAttempts.get(ip) || [];
  const validAttempts = attempts.filter(expireOldAttempts(now));
  return {
    remaining: Math.max(0, customLimit - validAttempts.length),
    reset: validAttempts.length > 0 ? validAttempts[0] + ONE_MINUTE_MS : now,
  };
};

/** Prunes attempts and IPs that are no longer relevant after one minutes. */
const clearOldAttempts = () => {
  const now = Date.now();
  for (const [ip, attempts] of lastAttempts.entries()) {
    const validAttempts = attempts.filter(expireOldAttempts(now));
    if (validAttempts.length === 0) {
      lastAttempts.delete(ip);
    } else {
      lastAttempts.set(ip, validAttempts);
    }
  }
};
setInterval(clearOldAttempts, 10 * 1000);

export const getUniqueIps = () => {
  return lastAttempts.size;
};

export const ipLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!RATE_LIMIT_ENABLED) {
    next();
    return;
  }

  // Exempt Agnai.chat from rate limiting since it's shared between a lot of
  // users. Dunno how to prevent this from being abused without some sort of
  // identifier sent from Agnaistic to identify specific users.
  if (req.ip === AGNAI_DOT_CHAT_IP) {
    next();
    return;
  }

  // If user is authenticated, key rate limiting by their token. Otherwise, key
  // rate limiting by their IP address. Mitigates key sharing.
  const rateLimitKey = req.user?.token || req.risuToken || req.ip;
  let customLimit = RATE_LIMIT
  
  // Get Custom rate limit for token 
  if (req.user?.token || "undefined" != "undefined") {
	   customLimit = req.user?.rateLimit ?? RATE_LIMIT;
	   customLimit+= 2; // don't ask.
  }

  const { remaining, reset } = getStatus(rateLimitKey, customLimit);
  res.set("X-RateLimit-Limit", customLimit.toString());
  res.set("X-RateLimit-Remaining", remaining.toString());
  res.set("X-RateLimit-Reset", reset.toString());

  const tryAgainInMs = getTryAgainInMs(rateLimitKey, customLimit);
  if (tryAgainInMs > 0) {
    res.set("Retry-After", tryAgainInMs.toString());
    res.status(200).json({
      error: {
        type: "proxy_rate_limited",
        message: `This proxy is rate limited to ${
          customLimit
        } prompts per minute. Please try again in ${Math.ceil(
          tryAgainInMs / 1000
        )} seconds.`,
      },
    });
  } else {
    next();
  }
};
