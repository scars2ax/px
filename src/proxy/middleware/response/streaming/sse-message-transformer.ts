import { Transform, TransformOptions } from "stream";
import { APIFormat } from "../../../../shared/key-management";
import {
  anthropicV1ToOpenAI,
  anthropicV2ToOpenAI, OpenAIChatCompletionStreamEvent,
  openAITextToOpenAIChat,
  StreamingCompletionTransformer
} from "./index";
import { openAIChatPassthrough } from "./transformers/openai-chat-passthrough";
import { assertNever } from "../../../../shared/utils";

type SSEMessageTransformerOptions = TransformOptions & {
  inputFormat: APIFormat;
  inputApiVersion?: string;
};

/**
 * Transforms SSE messages from one API format to OpenAI chat.completion.chunks.
 * Emits the original string SSE message as an "originalMessage" event.
 */
export class SSEMessageTransformer extends Transform  {
  private lastPosition: number;
  private msgCount: number;
  private readonly transformFn: StreamingCompletionTransformer;

  constructor(options: SSEMessageTransformerOptions) {
    super({ ...options, readableObjectMode: true });
    this.lastPosition = 0;
    this.msgCount = 0;
    this.transformFn = getTransformer(
      options.inputFormat,
      options.inputApiVersion
    );
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: Function) {
    try {
      const originalMessage = chunk.toString();
      const { event: transformedMessage, position: newPosition } =
        this.transformFn({
          data: originalMessage,
          lastPosition: this.lastPosition,
          index: this.msgCount++,
        });
      this.lastPosition = newPosition;

      if (this.msgCount === 1 && transformedMessage) {
        this.push(createInitialMessage(transformedMessage));
      }

      this.emit("originalMessage", originalMessage);
      this.push(transformedMessage);
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

function getTransformer(
  responseApi: APIFormat,
  version?: string
): StreamingCompletionTransformer {
  switch (responseApi) {
    case "openai":
      return openAIChatPassthrough;
    case "openai-text":
      return openAITextToOpenAIChat;
    case "anthropic":
      return version === "2023-01-01"
        ? anthropicV1ToOpenAI
        : anthropicV2ToOpenAI;
    case "google-palm":
      throw new Error("Google PaLM does not support streaming responses");
    default:
      assertNever(responseApi);
  }
}

/**
 * OpenAI streaming chat completions start with an event that contains only the
 * metadata and role (always 'assistant') for the response.  To simulate this
 * for APIs where the first event contains actual content, we create a fake
 * initial event with no content but correct metadata.
 */
function createInitialMessage(
  event: OpenAIChatCompletionStreamEvent
): OpenAIChatCompletionStreamEvent {
  return {
    ...event,
    choices: event.choices.map((choice) => ({
      ...choice,
      delta: { role: "assistant", content: "" },
    })),
  };
}
