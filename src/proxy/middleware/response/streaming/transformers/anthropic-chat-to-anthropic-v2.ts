import { StreamingCompletionTransformer } from "../index";
import { parseEvent, ServerSentEvent } from "../parse-sse";
import { logger } from "../../../../../logger";

const log = logger.child({
  module: "sse-transformer",
  transformer: "anthropic-chat-to-anthropic-v2",
});

/*
Event types
Each server-sent event includes a named event type and associated JSON data. Each event will use an SSE event name (e.g. event: message_stop), and include the matching event type in its data.
Each stream uses the following event flow:
    message_start: contains a Message object with empty content.
    A series of content blocks, each of which have a content_block_start, one or more content_block_delta events, and a content_block_stop event. Each content block will have an index that corresponds to its index in the final Message content array.
    One or more message_delta events, indicating top-level changes to the final Message object.
    A final message_stop event.

Ping events
Event streams may also include any number of ping events.

event: message_start
data: {"type": "message_start", "message": {"id": "msg_1nZdL29xx5MUA1yADyHTEsnR8uuvGzszyY", "type": "message", "role": "assistant", "content": [], "model": "claude-3-opus-20240229, "stop_reason": null, "stop_sequence": null, "usage": {"input_tokens": 25, "output_tokens": 1}}}

event: content_block_start
data: {"type": "content_block_start", "index":0, "content_block": {"type": "text", "text": ""}}

event: ping
data: {"type": "ping"}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "!"}}

event: content_block_stop
data: {"type": "content_block_stop", "index": 0}

event: message_delta
data: {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence":null, "usage":{"output_tokens": 15}}}

event: message_stop
data: {"type": "message_stop"}
 */

export type AnthropicV2StreamEvent = {
  log_id?: string;
  model?: string;
  completion: string;
  stop_reason: string | null;
};

export type AnthropicChatEventType =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop";

type AnthropicChatStartEvent = {
  type: "message_start";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: [];
    model: string;
    stop_reason: null;
    stop_sequence: null;
    usage: { input_tokens: number; output_tokens: number };
  };
};

type AnthropicChatContentBlockStartEvent = {
  type: "content_block_start";
  index: number;
  content_block: { type: "text"; text: string };
};

export type AnthropicChatContentBlockDeltaEvent = {
  type: "content_block_delta";
  index: number;
  delta: { type: "text_delta"; text: string };
};

type AnthropicChatContentBlockStopEvent = {
  type: "content_block_stop";
  index: number;
};

type AnthropicChatMessageDeltaEvent = {
  type: "message_delta";
  delta: {
    stop_reason: string;
    stop_sequence: null;
    usage: { output_tokens: number };
  };
};

type AnthropicChatMessageStopEvent = {
  type: "message_stop";
};

type AnthropicChatTransformerState = { content: string };

/**
 * Transforms an incoming Anthropic Chat SSE to an equivalent Anthropic V2
 * Text SSE.
 * For now we assume there is only one content block and message delta. In the
 * future Anthropic may add multi-turn responses or multiple content blocks
 * (probably for multimodal responses, image generation, etc) but as far as I
 * can tell this is not yet implemented.
 */
export const anthropicChatToAnthropicV2: StreamingCompletionTransformer<
  AnthropicV2StreamEvent,
  AnthropicChatTransformerState
> = (params) => {
  const { data } = params;

  const rawEvent = parseEvent(data);
  if (!rawEvent.data || !rawEvent.type) {
    return { position: -1 };
  }

  const deltaEvent = asAnthropicChatDelta(rawEvent);
  if (!deltaEvent) {
    return { position: -1 };
  }

  const newEvent = {
    log_id: params.fallbackId,
    model: params.fallbackModel,
    completion: deltaEvent.delta.text,
    stop_reason: null,
  };

  return { position: -1, event: newEvent };
};

export function asAnthropicChatDelta(
  event: ServerSentEvent
): AnthropicChatContentBlockDeltaEvent | null {
  if (
    !event.type ||
    !["content_block_start", "content_block_delta"].includes(event.type)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(event.data);
    if (parsed.type === "content_block_delta") {
      return parsed;
    } else if (parsed.type === "content_block_start") {
      return {
        type: "content_block_delta",
        index: parsed.index,
        delta: { type: "text_delta", text: parsed.content_block?.text ?? "" },
      };
    } else {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error("Invalid event type");
    }
  } catch (error) {
    log.warn({ error: error.stack, event }, "Received invalid event");
  }
  return null;
}
