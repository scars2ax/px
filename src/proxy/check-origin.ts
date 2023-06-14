import { config } from "../config";
import { RequestHandler } from "express";

const TIKTOK_ZOOMER_ORIGIN = "janitorai.com";

const BLOCKED_REFERERS = (config.blockedOrigins?.split(",") || []).concat([
  TIKTOK_ZOOMER_ORIGIN,
]);

/** Disallow requests from blocked origins and referers. */
export const checkOrigin: RequestHandler = (req, res, next) => {
  const blocks = BLOCKED_REFERERS || [];
  for (const block of blocks) {
    if (
      req.headers.origin?.includes(block) ||
      req.headers.referer?.includes(block)
    ) {
      req.log.warn(
        { origin: req.headers.origin, referer: req.headers.referer },
        "Blocked request from origin or referer"
      );

      // VenusAI requests incorrectly say they accept HTML despite immediately
      // trying to parse the response as JSON, so we check the body type instead
      const hasJsonBody =
        req.headers["content-type"]?.includes("application/json");
      if (!req.accepts("html") || hasJsonBody) {
        return res.status(403).json({
          error: { type: "blocked_origin", message: getBlockMessage(block) },
        });
      } else {
        const destination = config.blockRedirect || "https://openai.com";
        return res.status(403).send(
          `<html>
<head>
  <title>Redirecting</title>
  <meta http-equiv="refresh" content="3; url=${destination}" />
</head>
<body style="font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; justify-content: center; text-align: center;">
<h2>${getBlockMessage(block)}</h2>
<p><strong>Please hold while you are redirected to a more suitable service.</strong></p>
</body>
</html>`
        );
      }
    }
  }
  next();
};

function getBlockMessage(origin: string) {
  if (origin.includes(TIKTOK_ZOOMER_ORIGIN)) {
    return `This OpenAI account has been disabled due to fraud and abuse. Your IP address, user agent, and request details have been logged and will be shared with law enforcement's cybercrime division to assist in their investigation.`;
  } else {
    return config.blockMessage;
  }
}
