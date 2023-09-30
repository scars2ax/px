import { Transform, TransformOptions } from "stream";
// @ts-ignore
import { Parser } from "lifion-aws-event-stream";
import { logger } from "../../../logger";

const log = logger.child({ module: "sse-stream-adapter" });

type SSEStreamAdapterOptions = TransformOptions & { isAwsStream?: boolean };
type AwsEventStreamMessage = {
  headers: { ":message-type": "event" | "error" };
  payload: { message?: string /** base64 encoded */; bytes?: string };
};

/**
 * Receives either text chunks or AWS binary eventstream chunks and emits
 * full SSE events.
 */
export class ServerSentEventStreamAdapter extends Transform {
  private readonly isAwsStream;
  private parser = new Parser();
  private partialMessage = "";

  constructor(options?: SSEStreamAdapterOptions) {
    super(options);
    this.isAwsStream = options?.isAwsStream || false;

    this.parser.on("data", (data: AwsEventStreamMessage) => {
      const message = this.processAwsEvent(data);
      // log.debug({ data, message }, "Parsed AWS binary event");
      this.push(Buffer.from(message, "utf8"));
    });
  }

  processAwsEvent(event: AwsEventStreamMessage): string {
    if (event.headers[":message-type"] === "error") {
      return `event: error\ndata: ${event.payload.message}\n\n`;
    } else {
      return `data: ${Buffer.from(event.payload.bytes!, "base64").toString(
        "utf8"
      )}`;
    }
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: Function) {
    try {
      if (this.isAwsStream) {
        this.parser.write(chunk);
      } else {
        // We may receive multiple (or partial) SSE messages in a single chunk,
        // so we need to buffer and emit seperate stream events for full
        // messages so we can parse/transform them properly.
        const str = chunk.toString("utf8");
        const fullMessages = (this.partialMessage + str).split(/\r?\n\r?\n/);
        this.partialMessage = fullMessages.pop() || "";

        for (const message of fullMessages) {
          this.push(message);
        }
      }
      callback();
    } catch (error) {
      this.emit("error", error);
      callback(error);
    }
  }
}
