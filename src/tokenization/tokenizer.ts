import { Request } from "express";
import childProcess from "child_process";
import { config } from "../config";
import { logger } from "../logger";
import {
  init as initIpc,
  requestTokenCount as requestClaudeTokenCount,
} from "./claude-ipc";
import {
  init as initEncoder,
  getTokenCount as getOpenAITokenCount,
  OpenAIPromptMessage,
} from "./openai";

let canTokenizeClaude = false;

export async function init() {
  if (config.anthropicKey) {
    if (!isPythonInstalled()) {
      const skipWarning = !!process.env.DISABLE_MISSING_PYTHON_WARNING;
      process.env.MISSING_PYTHON_WARNING = skipWarning ? "" : "true";
    } else {
      canTokenizeClaude = await initIpc();
      if (!canTokenizeClaude) {
        logger.warn(
          "Anthropic key is set, but tokenizer is not available. Claude prompts will use a naive estimate for token count."
        );
      }
    }
  }
  if (config.openaiKey) {
    initEncoder();
  }
}

type TokenCountResult = {
  token_count: number;
  tokenizer: string;
  tokenization_duration_ms: number;
};
type TokenCountRequest = {
  req: Request;
} & (
  | { prompt: string; service: "anthropic" }
  | { prompt: OpenAIPromptMessage[]; service: "openai" }
);
export async function countTokens({
  req,
  service,
  prompt,
}: TokenCountRequest): Promise<TokenCountResult> {
  const time = process.hrtime();

  switch (service) {
    case "anthropic":
      if (!canTokenizeClaude) {
        const result = guesstimateTokens(prompt);
        return {
          token_count: result,
          tokenizer: "guesstimate (claude-ipc disabled)",
          tokenization_duration_ms: getElapsedMs(time),
        };
      }

      // If the prompt is absolutely massive (possibly malicious) don't even try
      if (prompt.length > 500000) {
        return {
          token_count: guesstimateTokens(JSON.stringify(prompt)),
          tokenizer: "guesstimate (prompt too long)",
          tokenization_duration_ms: getElapsedMs(time),
        };
      }

      try {
        const result = await requestClaudeTokenCount({
          requestId: String(req.id),
          prompt,
        });
        return {
          token_count: result,
          tokenizer: "claude-ipc",
          tokenization_duration_ms: getElapsedMs(time),
        };
      } catch (e: any) {
        req.log.error("Failed to tokenize with claude_tokenizer", e);
        const result = guesstimateTokens(prompt);
        return {
          token_count: result,
          tokenizer: `guesstimate (claude-ipc failed: ${e.message})`,
          tokenization_duration_ms: getElapsedMs(time),
        };
      }

    case "openai":
      const result = getOpenAITokenCount(prompt, req.body.model);
      return {
        ...result,
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

function guesstimateTokens(prompt: string) {
  // From Anthropic's docs:
  // The maximum length of prompt that Claude can see is its context window.
  // Claude's context window is currently ~6500 words / ~8000 tokens /
  // ~28000 Unicode characters.
  // This suggests 0.28 tokens per character but in practice this seems to be
  // a substantial underestimate in some cases.
  return Math.ceil(prompt.length * 0.325);
}

function isPythonInstalled() {
  try {
    const python = process.platform === "win32" ? "python" : "python3";
    childProcess.execSync(`${python} --version`, { stdio: "ignore" });
    return true;
  } catch (err) {
    logger.debug({ err: err.message }, "Python not installed.");
    return false;
  }
}
