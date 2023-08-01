import { AnthropicKey, Key } from "../../../shared/key-management";
import { isCompletionRequest } from "../common";
import { ProxyRequestMiddleware } from ".";

/**
 * Some keys require the prompt to start with `\n\nHuman:`. There is no way to
 * know this without trying to send the request and seeing if it fails. If a
 * key is marked as requiring a preamble, it will be added here.
 */
export const addAnthropicPreamble: ProxyRequestMiddleware = (
  _proxyReq,
  req
) => {
  if (!isCompletionRequest(req) || req.key?.service !== "anthropic") {
    return;
  }

  assertAnthropicKey(req.key);
  
  if (req.key.requiresPreamble) {
    let prompt = req.body.prompt;
    const preamble = prompt.startsWith("\n\nHuman:") ? "" : "\n\nHuman:";
    req.log.debug({ key: req.key.hash, preamble }, "Prompt requres preamble");
    prompt = preamble + prompt;

    // Adds `Assistant:` to the end of the prompt if the turn closest to the
    // end is from the `Human:` persona.
    const humanIndex = prompt.lastIndexOf("\n\nHuman:");
    const assistantIndex = prompt.lastIndexOf("\n\nAssistant:");
    const shouldAddAssistant = humanIndex > assistantIndex;
    req.log.debug(
      {
        key: req.key.hash,
        shouldAdd: shouldAddAssistant,
        hIndex: humanIndex,
        aIndex: assistantIndex,
      },
      "Possibly adding Assistant: to prompt"
    );
    if (shouldAddAssistant) prompt += "\n\nAssistant:";
    req.body.prompt = prompt;
  }
};

function assertAnthropicKey(key: Key): asserts key is AnthropicKey {
  if (key.service !== "anthropic") {
    throw new Error(`Expected an Anthropic key, got '${key.service}'`);
  }
}
