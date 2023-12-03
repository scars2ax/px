import { RequestHandler, Router } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config } from "../config";
import { keyPool } from "../shared/key-management";
import {
  ModelFamily,
  AzureOpenAIModelFamily,
  getAzureOpenAIModelFamily,
} from "../shared/models";
import { logger } from "../logger";
import { createQueueMiddleware } from "./queue";
import { ipLimiter } from "./rate-limit";
import { handleProxyError } from "./middleware/common";
import {
  applyQuotaLimits,
  blockZoomerOrigins,
  createPreprocessorMiddleware,
  finalizeBody,
  forceModel, // TODO: what is this for?
  limitCompletions,
  stripHeaders,
  createOnProxyReqHandler,
} from "./middleware/request";
import {
  createOnProxyResHandler,
  ProxyResHandlerWithBody,
} from "./middleware/response";

let modelsCache: any = null;
let modelsCacheTime = 0;

function getModelsResponse() {
  if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
    return modelsCache;
  }

  // https://platform.openai.com/docs/models/overview
  const knownModels = [
    "gpt-4",
    "gpt-4-32k",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k",
    "gpt-3.5-turbo-instruct",
  ];

  let available = new Set<AzureOpenAIModelFamily>();
  for (const key of keyPool.list()) {
    if (key.isDisabled || key.service !== "azure") continue;
    key.modelFamilies.forEach((family) =>
      available.add(family as AzureOpenAIModelFamily)
    );
  }
  const allowed = new Set<ModelFamily>(config.allowedModelFamilies);
  available = new Set([...available].filter((x) => allowed.has(x)));

  const models = knownModels
    .map((id) => ({
      id,
      object: "model",
      created: new Date().getTime(),
      owned_by: "azure",
      permission: [
        {
          id: "modelperm-" + id,
          object: "model_permission",
          created: new Date().getTime(),
          organization: "*",
          group: null,
          is_blocking: false,
        },
      ],
      root: id,
      parent: null,
    }))
    .filter((model) => available.has(getAzureOpenAIModelFamily(model.id)));

  modelsCache = { object: "list", data: models };
  modelsCacheTime = new Date().getTime();

  return modelsCache;
}

const handleModelRequest: RequestHandler = (_req, res) => {
  res.status(200).json(getModelsResponse());
};

const azureOpenaiResponseHandler: ProxyResHandlerWithBody = async (
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

  if (req.tokenizerInfo) {
    body.proxy_tokenizer = req.tokenizerInfo;
  }

  res.status(200).json(body);
};

const azureOpenAIProxy = createQueueMiddleware({
  beforeProxy: () => {}, // TODO: assign key
  proxyMiddleware: createProxyMiddleware({
    target: "will be set by router",
    router: (req) => {
      const [resourceName, deploymentId] = req.key!.key.split(":");
      return `https://${resourceName}.openai.azure.com/openai/deployments/${deploymentId}/chat/completions?api-version=2023-05-15`;
    },
    changeOrigin: true,
    selfHandleResponse: true,
    logger,
    on: {
      proxyReq: createOnProxyReqHandler({
        pipeline: [
          applyQuotaLimits,
          limitCompletions,
          blockZoomerOrigins,
          stripHeaders,
          finalizeBody,
        ],
      }),
      proxyRes: createOnProxyResHandler([azureOpenaiResponseHandler]),
      error: handleProxyError,
    },
  }),
});

const azureOpenAIRouter = Router();
azureOpenAIRouter.get("/v1/models", handleModelRequest);
azureOpenAIRouter.post(
  "/v1/chat/completions",
  ipLimiter,
  createPreprocessorMiddleware({
    inApi: "openai",
    outApi: "openai",
    service: "azure",
  }),
  azureOpenAIProxy
);

export const openai = azureOpenAIRouter;
