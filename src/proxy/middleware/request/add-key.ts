import { Key, keyPool } from "../../../key-management";
import type { ExpressHttpProxyReqCallback } from ".";

/** Add a key that can service this request to the request object. */
export const addKey: ExpressHttpProxyReqCallback = (proxyReq, req) => {
  let assignedKey: Key;

  if (!req.body?.model) {
    throw new Error("You must specify a model with your request.");
  }

  // Anthropic support has a special endpoint that accepts OpenAI-formatted
  // requests and translates them into Anthropic requests.  On this endpoint,
  // the requested model is an OpenAI one even though we're actually sending
  // an Anthropic request.
  // For such cases, ignore the requested model entirely.
  // Real Anthropic requests come in via /proxy/anthropic/v1/complete
  // The OpenAI-compatible endpoint is /proxy/anthropic/v1/chat/completions

  const openaiCompatible = req.path === "/proxy/anthropic/v1/chat/completions";
  if (openaiCompatible) {
    req.log.debug("Using an Anthropic key for an OpenAI-compatible request");
    // TODO: inspect the size of the prompt and only use the 100k token variant
    // if the prompt is above ~20k characters. Not going to bother bringing in
    // the real OpenAI tokenizer for this, just need a rough estimate.
    assignedKey = keyPool.get("claude-v1-100k");
  } else {
    assignedKey = keyPool.get(req.body.model);
  }

  req.key = assignedKey;
  req.log.info(
    {
      key: assignedKey.hash,
      model: req.body?.model,
      openaiCompatible,
    },
    "Assigned key to request"
  );

  if (assignedKey.service === "anthropic") {
    proxyReq.setHeader("X-API-Key", assignedKey.key);
  } else {
    proxyReq.setHeader("Authorization", `Bearer ${assignedKey.key}`);
  }
};
