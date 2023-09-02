import { RequestHandler } from "express";
import sanitize from "sanitize-html";
import { config } from "../config";

export const injectLocals: RequestHandler = (req, res, next) => {
  const quota = config.tokenQuota;
  res.locals.quotasEnabled =
    quota.turbo > 0 || quota.gpt4 > 0 || quota.claude > 0;

  res.locals.persistenceEnabled = config.gatekeeperStore !== "memory";

  if (req.query.flash) {
    const content = sanitize(String(req.query.flash))
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const match = content.match(/^([a-z]+):(.*)/);
    if (match) {
      res.locals.flash = { type: match[1], message: match[2] };
    } else {
      res.locals.flash = { type: "error", message: content };
    }
  } else {
    res.locals.flash = null;
  }

  next();
};
