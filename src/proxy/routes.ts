import * as express from "express";
import { gatekeeper } from "./auth/gatekeeper";
import { checkRisuToken } from "./auth/check-risu-token";
import { openai } from "./openai";
import { anthropic } from "./anthropic";

const proxyRouter = express.Router();
proxyRouter.use(
  express.json({ limit: "1536kb" }),
  express.urlencoded({ extended: true, limit: "1536kb" })
);
proxyRouter.use(gatekeeper);
proxyRouter.use(checkRisuToken);
proxyRouter.use((req, _res, next) => {
  req.startTime = Date.now();
  req.retryCount = 0;
  next();
});
proxyRouter.use("/openai", openai);
proxyRouter.use("/anthropic", anthropic);
export { proxyRouter as proxyRouter };
