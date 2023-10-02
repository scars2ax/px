import { Request, Response } from "express";
import * as http from "http";
import { buildFakeSseMessage } from "../common";
import { RawResponseBodyHandler, decodeResponseBody } from ".";
import { assertNever } from "../../../shared/utils";
import { ServerSentEventStreamAdapter } from "./sse-stream-adapter";
import { SSEMessageTransformer } from "./streaming/message-transformer";

/**
 * Consume the SSE stream and forward events to the client. Once the stream is
 * stream is closed, resolve with the full response body so that subsequent
 * middleware can work with it.
 *
 * Typically we would only need of the raw response handlers to execute, but
 * in the event a streamed request results in a non-200 response, we need to
 * fall back to the non-streaming response handler so that the error handler
 * can inspect the error response.
 *
 * Currently most frontends don't support Anthropic streaming, so users can opt
 * to send requests for Claude models via an endpoint that accepts OpenAI-
 * compatible requests and translates the received Anthropic SSE events into
 * OpenAI ones, essentially pretending to be an OpenAI streaming API.
 */
export const handleStreamedResponse: RawResponseBodyHandler = async (
  proxyRes,
  req,
  res
) => {
  // If these differ, the user is using the OpenAI-compatibile endpoint, so
  // we need to translate the SSE events into OpenAI completion events for their
  // frontend.
  if (!req.isStreaming) {
    const err = new Error(
      "handleStreamedResponse called for non-streaming request."
    );
    req.log.error({ stack: err.stack, api: req.inboundApi }, err.message);
    throw err;
  }

  const key = req.key!;
  if (proxyRes.statusCode !== 200) {
    // Ensure we use the non-streaming middleware stack since we won't be
    // getting any events.
    req.isStreaming = false;
    req.log.warn(
      { statusCode: proxyRes.statusCode, key: key.hash },
      `Streaming request returned error status code. Falling back to non-streaming response handler.`
    );
    return decodeResponseBody(proxyRes, req, res);
  }

  req.log.debug(
    { headers: proxyRes.headers, key: key.hash },
    `Received SSE headers.`
  );
  const contentType = proxyRes.headers["content-type"];

  return new Promise((resolve, reject) => {
    req.log.info({ key: key.hash }, `Starting to proxy SSE stream.`);

    // Queued streaming requests will already have a connection open and headers
    // sent due to the heartbeat handler.  In that case we can just start
    // streaming the response without sending headers.
    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      copyHeaders(proxyRes, res);
      res.flushHeaders();
    }

    const adapter = new ServerSentEventStreamAdapter({
      isAwsStream: contentType === "application/vnd.amazon.eventstream",
    });
    const transformer = new SSEMessageTransformer({
      inputFormat: req.outboundApi, // outbound from the request's perspective
      inputApiVersion: String(proxyRes.headers["anthropic-version"]),
    });

    const events: string[] = [];

    proxyRes.pipe(adapter).pipe(transformer);

    transformer.on("originalMessage", (message: boolean) => {

    });
    transformer.on("data", (chunk: any) => {
      try {
        res.write(chunk + "\n\n");
      } catch (err) {
        adapter.emit("error", err);
      }
    });

    adapter.on("end", () => {
      try {
        req.log.info({ key: key.hash }, `Finished proxying SSE stream.`);
        const finalBody = convertEventsToFinalResponse(events, req);
        res.end();
        resolve(finalBody);
      } catch (err) {
        adapter.emit("error", err);
      }
    });

    adapter.on("error", (err) => {
      req.log.error({ error: err, key: key.hash }, `Mid-stream error.`);
      const errorEvent = buildFakeSseMessage("stream-error", err.message, req);
      res.write(`data: ${JSON.stringify(errorEvent)}\n\ndata: [DONE]\n\n`);
      res.end();
      reject(err);
    });
  });
};

/** Copy headers, excluding ones we're already setting for the SSE response. */
function copyHeaders(proxyRes: http.IncomingMessage, res: Response) {
  const toOmit = [
    "content-length",
    "content-encoding",
    "transfer-encoding",
    "content-type",
    "connection",
    "cache-control",
  ];
  for (const [key, value] of Object.entries(proxyRes.headers)) {
    if (!toOmit.includes(key) && value) {
      res.setHeader(key, value);
    }
  }
}

/**
 * Converts the list of incremental SSE events into an object that resembles a
 * full, non-streamed response from the API so that subsequent middleware can
 * operate on it as if it were a normal response.
 * Events are expected to be in the format they were received from the API.
 */
function convertEventsToFinalResponse(events: string[], req: Request) {
  switch (req.outboundApi) {
    case "openai": {
      let merged: OpenAiChatCompletionResponse = {
        id: "",
        object: "",
        created: 0,
        model: "",
        choices: [],
      };
      merged = events.reduce((acc, event, i) => {
        if (!event.startsWith("data: ")) return acc;
        if (event === "data: [DONE]") return acc;

        const data = JSON.parse(event.slice("data: ".length));

        // The first chat chunk only contains the role assignment and metadata
        if (i === 0) {
          return {
            id: data.id,
            object: data.object,
            created: data.created,
            model: data.model,
            choices: [
              {
                message: { role: data.choices[0].delta.role, content: "" },
                index: 0,
                finish_reason: null,
              },
            ],
          };
        }

        if (data.choices[0].delta.content) {
          acc.choices[0].message.content += data.choices[0].delta.content;
        }
        acc.choices[0].finish_reason = data.choices[0].finish_reason;
        return acc;
      }, merged);
      return merged;
    }
    case "openai-text": {
      let merged: OpenAiTextCompletionResponse = {
        id: "",
        object: "",
        created: 0,
        model: "",
        choices: [],
        // TODO: merge logprobs
      };
      merged = events.reduce((acc, event) => {
        if (!event.startsWith("data: ")) return acc;
        if (event === "data: [DONE]") return acc;

        const data = JSON.parse(event.slice("data: ".length));

        return {
          id: data.id,
          object: data.object,
          created: data.created,
          model: data.model,
          choices: [
            {
              text: acc.choices[0]?.text + data.choices[0].text,
              index: 0,
              finish_reason: data.choices[0].finish_reason,
              logprobs: null,
            },
          ],
        };
      }, merged);
      return merged;
    }
    case "anthropic": {
      if (req.headers["anthropic-version"] === "2023-01-01") {
        return convertAnthropicV1(events, req);
      }

      let merged: AnthropicCompletionResponse = {
        completion: "",
        stop_reason: "",
        truncated: false,
        stop: null,
        model: req.body.model,
        log_id: "",
        exception: null,
      };

      merged = events.reduce((acc, event) => {
        if (!event.startsWith("data: ")) return acc;
        if (event === "data: [DONE]") return acc;

        const data = JSON.parse(event.slice("data: ".length));

        return {
          completion: acc.completion + data.completion,
          stop_reason: data.stop_reason,
          truncated: data.truncated,
          stop: data.stop,
          log_id: data.log_id,
          exception: data.exception,
          model: acc.model,
        };
      }, merged);
      return merged;
    }
    case "google-palm": {
      throw new Error("PaLM streaming not yet supported.");
    }
    default:
      assertNever(req.outboundApi);
  }
}

/** Older Anthropic streaming format which sent full completion each time. */
function convertAnthropicV1(events: string[], req: Request) {
  const lastEvent = events[events.length - 2].toString();
  const data = JSON.parse(
    lastEvent.slice(lastEvent.indexOf("data: ") + "data: ".length)
  );
  const final: AnthropicCompletionResponse = { ...data, log_id: req.id };
  return final;
}
