import type { Request, RequestHandler } from "express";
import type { ClientRequest } from "http";
import type { ProxyReqCallback } from "http-proxy";

// Express middleware (runs before http-proxy-middleware, can be async)
export { setApiFormat } from "./set-api-format";
export { transformOutboundPayload } from "./transform-outbound-payload";

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
 * Standard Express middleware that runs before the request is passed to
 * http-proxy-middleware.
 * 
 * Async functions can be used here, but you will not have access to the proxied
 * request/response objects, nor the data set by HPMRequestMiddleware functions
 * as they have not yet been run.
 * 
 * Note that these functions only run once ever per request, even if the request
 * is automatically retried by the request queue middleware.
 */
export type RequestMiddleware = RequestHandler;

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
