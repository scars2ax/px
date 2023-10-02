import { Transform, TransformOptions } from "stream";
import { APIFormat } from "../../../../shared/key-management";
import {
  anthropicV1ToOpenAI,
  anthropicV2ToOpenAI,
  openAITextToOpenAIChat,
  StreamingResponseTransformer,
} from "./index";
import { openAIChatPassthrough } from "./transformers/openai-chat-passthrough";
import { assertNever } from "../../../../shared/utils";

type MessageTransformerOptions = TransformOptions & {
  inputFormat: APIFormat;
  inputApiVersion?: string;
};

export class SSEMessageTransformer extends Transform  {
  private lastPosition: number;
  private msgCount: number;
  private readonly transformFn: StreamingResponseTransformer;

  constructor(options: MessageTransformerOptions) {
    super(options);
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

      this.emit("originalMessage", originalMessage);
      this.emit("transformedMessage", transformedMessage);
      this.push(transformedMessage + "\n\n");
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

function getTransformer(
  responseApi: APIFormat,
  version?: string
): StreamingResponseTransformer {
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
