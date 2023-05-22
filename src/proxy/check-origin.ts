import { config } from "../config";
import { RequestHandler } from "express";

const BLOCKED_REFERERS = config.blockedOrigins?.split(",") || [];

/** Disallow requests from blocked origins and referers. */
export const checkOrigin: RequestHandler = (req, res, next) => {
  const blocks = BLOCKED_REFERERS || [];
  for (const block of blocks) {
    if (
      req.headers.origin?.includes(block) ||
      req.headers.referer?.includes(block)
    ) {
      res.status(403).json({
        error: { type: "blocked_origin", message: config.blockMessage },
      });
      return;
    }
  }
  next();
};
