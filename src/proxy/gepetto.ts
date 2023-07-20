import { Request, RequestHandler, Router } from "express";
import * as http from "http";
import { createProxyMiddleware } from "http-proxy-middleware";
import { logger } from "../logger";
import { createQueueMiddleware } from "./queue";
import { ipLimiter } from "./rate-limit";
import { handleProxyError } from "./middleware/common";
import {
  createPreprocessorMiddleware,
  finalizeBody,
} from "./middleware/request";
import {
  ProxyResHandlerWithBody,
  createOnProxyResHandler,
} from "./middleware/response";
import { keyPool } from "../key-management";
import { config } from "../config";

const getModelsResponse = () => {
  const variants = ["gepetto4-v1"];
  const models = variants.map((id) => ({
    id,
    object: "model",
    created: new Date().getTime(),
    owned_by: "some swedes",
    permission: [],
    root: "openai (maybe?)",
    parent: null,
  }));
  return { object: "list", data: models };
};

const handleModelRequest: RequestHandler = (_req, res) => {
  res.status(200).json(getModelsResponse());
};

const rewriteGepettoRequest = (
  proxyReq: http.ClientRequest,
  req: Request,
  res: http.ServerResponse
) => {
  const rewriterPipeline = [finalizeBody];

  try {
    if (req.body.stream) {
      throw new Error("Streaming is not supported on this endpoint.");
    }

    // gepetto doesn't use api keys but most of the code expects one to be present
    req.key = keyPool.get("gpt-4");
    for (const rewriter of rewriterPipeline) {
      rewriter(proxyReq, req, res, {});
    }
  } catch (error) {
    req.log.error(error, "Error while executing proxy rewriter");
    proxyReq.destroy(error as Error);
  }
};

const gepettoResponseHandler: ProxyResHandlerWithBody = async (
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

const gepettoProxy = createQueueMiddleware(
  createProxyMiddleware({
    target: process.env.GEPETTO_URL,
    changeOrigin: true,
    on: {
      proxyReq: rewriteGepettoRequest,
      proxyRes: createOnProxyResHandler([gepettoResponseHandler]),
      error: handleProxyError,
    },
    selfHandleResponse: true,
    logger,
    pathRewrite: {
      // The POST request needs to be to the root path.
      "^/v1/chat/completions": "/",
    },
  })
);

const gepettoRouter = Router();
// Fix paths because clients don't consistently use the /v1 prefix.
gepettoRouter.use((req, _res, next) => {
  if (!req.path.startsWith("/v1/")) {
    req.url = `/v1${req.url}`;
  }
  next();
});
gepettoRouter.get("/v1/models", handleModelRequest);
gepettoRouter.post(
  "/v1/chat/completions",
  ipLimiter,
  createPreprocessorMiddleware({ inApi: "openai", outApi: "gepetto" }),
  gepettoProxy
);
// Redirect browser requests to the homepage.
gepettoRouter.get("*", (req, res, next) => {
  const isBrowser = req.headers["user-agent"]?.includes("Mozilla");
  if (isBrowser) {
    res.redirect("/");
  } else {
    next();
  }
});

export const gepetto = gepettoRouter;
