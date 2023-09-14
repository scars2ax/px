import { Request } from "express";
import { config } from "../../config";
import {
  init as initClaude,
  getTokenCount as getClaudeTokenCount,
} from "./claude";
import {
  init as initOpenAi,
  getTokenCount as getOpenAITokenCount,
  OpenAIPromptMessage,
} from "./openai";

export async function init() {
  if (config.anthropicKey) {
    initClaude();
  }
  if (config.openaiKey) {
    initOpenAi();
  }
}

type TokenCountResult = {
  token_count: number;
  tokenizer: string;
  tokenization_duration_ms: number;
};
type TokenCountRequest = { req: Request } & ( // Incoming prompts
  | { prompt: OpenAIPromptMessage[]; completion?: never; service: "openai" }
  | { prompt: string; completion?: never; service: "anthropic" }
  | { prompt: string; completion?: never; service: "google-palm" }
  // Returned completions
  | { prompt?: never; completion: string; service: "openai" }
  | { prompt?: never; completion: string; service: "anthropic" }
  | { prompt?: never; completion: string; service: "google-palm" }
);
export async function countTokens({
  req,
  service,
  prompt,
  completion,
}: TokenCountRequest): Promise<TokenCountResult> {
  const time = process.hrtime();
  switch (service) {
    case "anthropic":
      return {
        ...getClaudeTokenCount(prompt ?? completion, req.body.model),
        tokenization_duration_ms: getElapsedMs(time),
      };
    case "openai":
      return {
        ...getOpenAITokenCount(prompt ?? completion, req.body.model),
        tokenization_duration_ms: getElapsedMs(time),
      };
    case "google-palm":
      // TODO: Can't find a tokenization library for PaLM. There is an API
      // endpoint for it but it adds significant latency to the request.
      return {
        ...getOpenAITokenCount(prompt ?? completion, req.body.model),
        tokenization_duration_ms: getElapsedMs(time),
      };
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

function getElapsedMs(time: [number, number]) {
  const diff = process.hrtime(time);
  return diff[0] * 1000 + diff[1] / 1e6;
}
