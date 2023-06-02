import { countTokens } from "../../../tokenization";
import { RequestPreprocessor } from ".";
import { openAIMessagesToClaudePrompt } from "./transform-outbound-payload";

export const checkPromptSize: RequestPreprocessor = async (req) => {
  const prompt =
    req.inboundApi === "openai" ? req.body.messages : req.body.prompt;

  let result;
  if (req.outboundApi === "openai") {
    result = await countTokens({ req, prompt, service: "openai" });
  } else {
    // If we're doing OpenAI-to-Anthropic, we need to convert the messages to a
    // prompt first before counting tokens, as that process affects the token
    // count.
    let promptStr =
      req.inboundApi === "anthropic"
        ? prompt
        : openAIMessagesToClaudePrompt(prompt);
    result = await countTokens({
      req,
      prompt: promptStr,
      service: "anthropic",
    });
  }

  req.promptTokens = result.token_count;

  // TODO: Remove once token counting is stable
  req.log.debug({ result }, "Counted prompt tokens");
  req.debug = req.debug ?? {};
  req.debug = {
    ...req.debug,
    ...result,
  };
};
