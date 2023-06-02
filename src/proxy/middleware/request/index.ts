import type { Request, RequestHandler, Response } from "express";
import type { ClientRequest } from "http";
import type { ProxyReqCallback } from "http-proxy";
import { handleInternalError } from "../common";

// Express middleware (runs before http-proxy-middleware, can be async)
import { setApiFormat } from "./set-api-format";
import { transformOutboundPayload } from "./transform-outbound-payload";

// HPM middleware (runs on onProxyReq, cannot be async)
export { addKey } from "./add-key";
export { finalizeBody } from "./finalize-body";
export { languageFilter } from "./language-filter";
export { limitCompletions } from "./limit-completions";
export { limitOutputTokens } from "./limit-output-tokens";
export { transformKoboldPayload } from "./transform-kobold-payload";

const OPENAI_CHAT_COMPLETION_ENDPOINT = "/v1/chat/completions";
const ANTHROPIC_COMPLETION_ENDPOINT = "/v1/complete";

/** Returns true if we're making a request to a completion endpoint. */
export function isCompletionRequest(req: Request) {
  return (
    req.method === "POST" &&
    [OPENAI_CHAT_COMPLETION_ENDPOINT, ANTHROPIC_COMPLETION_ENDPOINT].some(
      (endpoint) => req.path.startsWith(endpoint)
    )
  );
}

/**
 * Middleware that runs prior to the request being handled by http-proxy-
 * middleware.
 *
 * Async functions can be used here, but you will not have access to the proxied
 * request/response objects, nor the data set by ProxyRequestMiddleware
 * functions as they have not yet been run.
 *
 * User will have been authenticated by the time this middleware runs, but your
 * request won't have been assigned an API key yet.
 *
 * Note that these functions only run once ever per request, even if the request
 * is automatically retried by the request queue middleware.
 */
export type RequestPreprocessor = (req: Request) => void | Promise<void>;

/**
 * Middleware that runs immediately before the request is sent to the API in
 * response to http-proxy-middleware's `proxyReq` event.
 *
 * Async functions cannot be used here as HPM's event emitter is not async and
 * will not wait for the promise to resolve before sending the request.
 *
 * Note that these functions may be run multiple times per request if the
 * first attempt is rate limited and the request is automatically retried by the
 * request queue middleware.
 */
export type ProxyRequestMiddleware = ProxyReqCallback<ClientRequest, Request>;

/**
 * Returns a middleware function that processes the request body into the given
 * API format, and then sequentially runs the given additional preprocessors.
 */
export const createPreprocessorMiddleware = (
  apiFormat: Parameters<typeof setApiFormat>[0],
  additionalPreprocessors?: RequestPreprocessor[]
): RequestHandler => {
  const preprocessors: RequestPreprocessor[] = [
    setApiFormat(apiFormat),
    transformOutboundPayload,
    ...(additionalPreprocessors ?? []),
  ];

  return async (req, res, next) => {
    try {
      for (const preprocessor of preprocessors) {
        await preprocessor(req);
      }
      next();
    } catch (error) {
      req.log.error(error, "Error while executing request preprocessor");
      handleInternalError(error as Error, req, res);
    }
  };
};
