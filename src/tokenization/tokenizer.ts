import { Request } from "express";
import { config } from "../config";
import { AIService } from "../key-management";
import { logger } from "../logger";
import {
  init as initIpc,
  requestTokenCount as requestClaudeTokenCount,
} from "./claude-ipc";
import {
  init as initEncoder,
  getTokenCount as getOpenAITokenCount,
} from "./openai";

let canTokenizeClaude = false;
let canTokenizeOpenAI = false;

export async function init() {
  if (config.anthropicKey) {
    canTokenizeClaude = await initIpc();
    if (!canTokenizeClaude) {
      logger.warn(
        "Anthropic key is set, but tokenizer is not available. Claude prompts will use a naive estimate for token count."
      );
    }
  }
  if (config.openaiKey) {
    canTokenizeOpenAI = initEncoder();
  }
}

export async function countTokens({
  req,
  prompt,
  service,
}: {
  req: Request;
  prompt: string;
  service: AIService;
}) {
  if (service === "anthropic") {
    if (!canTokenizeClaude) return guesstimateClaudeTokenCount(prompt);
    try {
      return await requestClaudeTokenCount({
        requestId: String(req.id),
        prompt: prompt,
      });
    } catch (e) {
      req.log.error("Failed to tokenize with claude_tokenizer", e);
      return guesstimateClaudeTokenCount(prompt);
    }
  }
  if (service === "openai") {
    // All OpenAI models we support use the same tokenizer currently
    return getOpenAITokenCount(prompt);
  }
}

function guesstimateClaudeTokenCount(prompt: string) {
  // From Anthropic's docs:
  // The maximum length of prompt that Claude can see is its context window.
  // Claude's context window is currently ~6500 words / ~8000 tokens /
  // ~28000 Unicode characters.
  // We'll round up to ~0.3 tokens per character
  return Math.ceil(prompt.length * 0.3);
}
