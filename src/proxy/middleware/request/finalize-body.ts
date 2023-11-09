import { fixRequestBody } from "http-proxy-middleware";
import type { ProxyRequestMiddleware } from ".";
import { config } from "../../../config";


/** Finalize the rewritten request body. Must be the last rewriter. */
export const finalizeBody: ProxyRequestMiddleware = (proxyReq, req) => {
  if (["POST", "PUT", "PATCH"].includes(req.method ?? "") && req.body) {
	
	// Disable prompt injections ._.
	
	
	let updatedBody = JSON.stringify(req.body);


	// Alright will just remove stream if model is bison one ... (Probably needs removal) 
	if (req.body.model === "text-bison-001") {
      // Remove "stream" property from updatedBody
      const { stream, ...bodyWithoutStream } = JSON.parse(updatedBody);
      updatedBody = JSON.stringify(bodyWithoutStream);
    }
	//
    proxyReq.setHeader("Content-Length", Buffer.byteLength(updatedBody));
    (req as any).rawBody = Buffer.from(updatedBody);
    // body-parser and http-proxy-middleware don't play nice together
    fixRequestBody(proxyReq, req);
  }
};
