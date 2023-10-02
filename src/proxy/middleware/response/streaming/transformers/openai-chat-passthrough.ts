import { OpenAiChatCompletionStreamEvent, SSEResponseTransformArgs } from "../index";
import { parseEvent } from "../parse-sse";
import { logger } from "../../../../../logger";

const log = logger.child({
  module: "sse-transformer",
  transformer: "openai-chat-passthrough",
});

export const openAIChatPassthrough = (params: SSEResponseTransformArgs) => {
  const { data } = params;

  const rawEvent = parseEvent(data);
  if (!rawEvent.data || rawEvent.data === "[DONE]") {
    return { position: -1 };
  }

  const completionEvent = asCompletionEvent(rawEvent.data);
  if (!completionEvent) {
    return { position: -1 };
  }

  return { position: -1, event: completionEvent };
};

function asCompletionEvent(
  event: string
): OpenAiChatCompletionStreamEvent | null {
  try {
    return JSON.parse(event);
  } catch (error) {
    log.warn({ error, event }, "Received invalid data event");
  }
  return null;
}
