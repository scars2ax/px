import type { ProxyRequestMiddleware } from ".";

/**
 * For AWS requests, the body is signed and the signature is added to the
 * request headers. This rewriter finalizes the body by serializing it to JSON
 * and copying the signature to the proxy request headers, as well as rewriting
 * the proxied request path.
 */
export const finalizeAwsRequest: ProxyRequestMiddleware = (proxyReq, req) => {
  if (!req.signedRequest) {
    throw new Error("Expected req.signedRequest to be set");
  }

  // The path depends on the selected model and the assigned key's region.
  proxyReq.path = req.signedRequest.path;

  // Amazon doesn't want extra headers, so we need to remove all of them and
  // reassign only the ones specified in the signed request.
  proxyReq.getRawHeaderNames().forEach(proxyReq.removeHeader.bind(proxyReq));
  Object.entries(req.signedRequest.headers).forEach(([key, value]) => {
    proxyReq.setHeader(key, value);
  });

  // Don't use fixRequestBody here because it adds a content-length header.
  // Amazon doesn't want that and it breaks the signature.
  proxyReq.write(req.signedRequest.body);
};
