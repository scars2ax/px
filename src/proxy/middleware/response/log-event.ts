import { Request } from "express";
import { createHash } from "crypto";
import { config } from "../../../config";
import { eventLogger } from "../../../shared/prompt-logging";
import {
  getCompletionFromBody,
  getModelFromBody,
  isImageGenerationRequest,
  isTextGenerationRequest,
} from "../common";
import { ProxyResHandlerWithBody } from ".";
import { assertNever } from "../../../shared/utils";
import {
  MistralAIChatMessage,
  OpenAIChatMessage,
} from "../../../shared/api-schemas";
import { getOpenAIModelFamily } from "../../../shared/models";
import { getUser } from "../../../shared/users/user-store";

/** If event logging is enabled, logs the event */
export const logEvent: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  _res,
  responseBody
) => {
  if (!config.eventLogging) {
    return;
  }
  if (typeof responseBody !== "object") {
    throw new Error("Expected body to be an object");
  }
  if (req.outboundApi !== "openai") {
    // only openai for now
    return;
  }
  if (!req.user) {
    return;
  }

  const loggable = isTextGenerationRequest(req);
  if (!loggable) return;

  const messages = req.body.messages as OpenAIChatMessage[];

  let hashes = [];
  hashes.push(hashMessages(messages));
  for (
    let i = 1;
    i <= Math.min(config.eventLoggingTrim!, messages.length);
    i++
  ) {
    hashes.push(hashMessages(messages.slice(0, -i)));
  }

  const model = getModelFromBody(req, responseBody);
  const family = getOpenAIModelFamily(req.body.model);
  const userToken = req.user!.token;
  const newTokens = getUser(req.user!.token)!.tokenCounts[family] ?? 0;
  eventLogger.logEvent({
    model,
    family,
    hashes,
    userToken,
    usage: newTokens,
  });
};

const hashMessages = (messages: OpenAIChatMessage[]): string => {
  let hasher = createHash("sha256");
  let messageTexts = [];
  for (const msg of messages) {
    if (!["system", "user", "assistant"].includes(msg.role)) continue;
    if (typeof msg.content === "string") {
      messageTexts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      if (msg.content[0].type === "text") {
        messageTexts.push(msg.content[0].text);
      }
    }
  }
  hasher.update(messageTexts.join("<|im_sep|>"));
  return hasher.digest("hex");
};
