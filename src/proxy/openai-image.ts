import { RequestHandler, Router } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config } from "../config";
import { logger } from "../logger";
import { createQueueMiddleware } from "./queue";
import { ipLimiter } from "./rate-limit";
import { handleProxyError } from "./middleware/common";
import {
  addKey,
  applyQuotaLimits,
  blockZoomerOrigins,
  createPreprocessorMiddleware,
  finalizeBody,
  stripHeaders,
  createOnProxyReqHandler,
} from "./middleware/request";
import {
  createOnProxyResHandler,
  ProxyResHandlerWithBody,
} from "./middleware/response";
import { generateModelList } from "./openai";
import {
  mirrorGeneratedImage,
  OpenAIImageGenerationResult,
} from "../shared/file-storage/mirror-generated-image";

const KNOWN_MODELS = ["dall-e-2", "dall-e-3"];

let modelListCache: any = null;
let modelListValid = 0;
const handleModelRequest: RequestHandler = (_req, res) => {
  if (new Date().getTime() - modelListValid < 1000 * 60) return modelListCache;
  const result = generateModelList(KNOWN_MODELS);
  modelListCache = { object: "list", data: result };
  modelListValid = new Date().getTime();
  res.status(200).json();
};

const openaiImagesResponseHandler: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  res,
  body
) => {
  if (typeof body !== "object") {
    throw new Error("Expected body to be an object");
  }

  if (body.data && body.data[0].url) {
    const baseUrl = req.protocol + "://" + req.get("host");
    await mirrorGeneratedImage(baseUrl, body as OpenAIImageGenerationResult);
  }

  if (config.promptLogging) {
    const host = req.get("host");
    body.proxy_note = `Prompts are logged on this proxy instance. See ${host} for more information.`;
  }

  if (req.tokenizerInfo) {
    body.proxy_tokenizer = req.tokenizerInfo;
  }

  res.status(200).json(body);
};

const openaiImagesProxy = createQueueMiddleware({
  proxyMiddleware: createProxyMiddleware({
    target: "https://api.openai.com",
    changeOrigin: true,
    selfHandleResponse: true,
    logger,
    on: {
      proxyReq: createOnProxyReqHandler({
        pipeline: [
          applyQuotaLimits,
          addKey,
          blockZoomerOrigins,
          stripHeaders,
          finalizeBody,
        ],
      }),
      proxyRes: createOnProxyResHandler([openaiImagesResponseHandler]),
      error: handleProxyError,
    },
  }),
});

const openaiImagesRouter = Router();
openaiImagesRouter.get("/v1/models", handleModelRequest);
openaiImagesRouter.post(
  "/v1/images/generations",
  ipLimiter,
  createPreprocessorMiddleware({
    inApi: "openai-image",
    outApi: "openai-image",
    service: "openai",
  }),
  openaiImagesProxy
);
export const openaiImage = openaiImagesRouter;
