import { Request, Router } from "express";
import * as http from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config } from "../config";
import { logger } from "../logger";
import {
  addKey,
  finalizeBody,
  languageFilter,
  limitOutputTokens,
  transformOutboundPayload,
} from "./middleware/request";
import {
  ProxyResHandlerWithBody,
  createOnProxyResHandler,
  handleInternalError,
} from "./middleware/response";
import { createQueueMiddleware } from "./queue";

const rewriteAnthropicRequest = (
  proxyReq: http.ClientRequest,
  req: Request,
  res: http.ServerResponse
) => {
  req.api = "anthropic";
  const rewriterPipeline = [
    addKey,
    languageFilter,
    limitOutputTokens,
    transformOutboundPayload,
    finalizeBody,
  ];

  try {
    for (const rewriter of rewriterPipeline) {
      rewriter(proxyReq, req, res, {});
    }
  } catch (error) {
    req.log.error(error, "Error while executing proxy rewriter");
    proxyReq.destroy(error as Error);
  }
};

/** Only used for non-streaming requests. */
const anthropicResponseHandler: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  res,
  body
) => {
  if (typeof body !== "object") {
    throw new Error("Expected body to be an object");
  }

  if (config.promptLogging) {
    const host = req.get("host");
    body.proxy_note = `Prompts are logged on this proxy instance. See ${host} for more information.`;
  }

  res.status(200).json(body);
};

const anthropicProxy = createProxyMiddleware({
  target: "https://api.anthropic.com",
  changeOrigin: true,
  on: {
    proxyReq: rewriteAnthropicRequest,
    proxyRes: createOnProxyResHandler([anthropicResponseHandler]),
    error: handleInternalError,
  },
  selfHandleResponse: true,
  logger,
});
const queuedAnthropicProxy = createQueueMiddleware(anthropicProxy);

const anthropicRouter = Router();
anthropicRouter.use((req, _res, next) => {
  if (!req.path.startsWith("/v1/")) {
    req.url = `/v1${req.url}`;
  }
  next();
});
anthropicRouter.get("/v1/models", (req, res) => {
  res.json(buildFakeModelsResponse());
});
anthropicRouter.post("/v1/complete", queuedAnthropicProxy);
// This is the OpenAI endpoint, to let users send OpenAI-formatted requests
// to the Anthropic API. We need to rewrite them first.
anthropicRouter.post("/v1/chat/completions", queuedAnthropicProxy);
// Redirect browser requests to the homepage.
anthropicRouter.get("*", (req, res, next) => {
  const isBrowser = req.headers["user-agent"]?.includes("Mozilla");
  if (isBrowser) {
    res.redirect("/");
  } else {
    next();
  }
});

function buildFakeModelsResponse() {
  const claudeVariants = [
    "claude-v1",
    "claude-v1-100k",
    "claude-instant-v1",
    "claude-instant-v1-100k",
    "claude-v1.3",
    "claude-v1.3-100k",
    "claude-v1.2",
    "claude-v1.0",
    "claude-instant-v1.1",
    "claude-instant-v1.1-100k",
    "claude-instant-v1.0",
  ];

  const models = claudeVariants.map((id) => ({
    id,
    object: "model",
    created: new Date().getTime(),
    owned_by: "anthropic",
    permission: [],
    root: "claude",
    parent: null,
  }));

  return {
    models,
  };
}

export const anthropic = anthropicRouter;
