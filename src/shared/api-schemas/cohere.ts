import { z } from "zod";
import {
  OPENAI_OUTPUT_MAX,
  OpenAIV1ChatCompletionSchema,
  flattenOpenAIMessageContent,
} from "./openai";
import { APIFormatTransformer } from ".";

// https://docs.cohere.com/reference/chat
export const CohereV1ChatSchema = z
  .object({
    message: z.string(),
    model: z.string().default("command-r-plus"),
    stream: z.boolean().default(false).optional(),
    preamble: z.string().optional(),
    chat_history: z
      .array(
        // Either a message from a chat participant, or a past tool call
        z.union([
          z.object({
            role: z.enum(["CHATBOT", "SYSTEM", "USER"]),
            message: z.string(),
            tool_calls: z
              .array(z.object({ name: z.string(), parameters: z.any() }))
              .optional(),
          }),
          z.object({
            role: z.enum(["TOOL"]),
            tool_results: z.array(
              z.object({
                call: z.object({ name: z.string(), parameters: z.any() }),
                outputs: z.array(z.any()),
              })
            ),
          }),
        ])
      )
      .optional(),
    // Don't allow conversation_id as it causes calls to be stateful and we don't
    // offer guarantees about which key a user's request will be routed to.
    conversation_id: z.literal(undefined).optional(),
    prompt_truncation: z
      .enum(["AUTO", "AUTO_PRESERVE_ORDER", "OFF"])
      .optional(),
    /*
    Supporting RAG is complex because documents can be arbitrary size and have
    to have embeddings generated, which incurs a cost that is not trivial to
    estimate. We don't support it for now.
    connectors: z
      .array(
        z.object({
          id: z.string(),
          user_access_token: z.string().optional(),
          continue_on_failure: z.boolean().default(false).optional(),
          options: z.any().optional(),
        })
      )
      .optional(),
    search_queries_only: z.boolean().default(false).optional(),
    documents: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string().optional(),
          text: z.string(),
          _excludes: z.array(z.string()).optional(),
        })
      )
      .optional(),
    citation_quality: z.enum(["accurate", "fast"]).optional(),
    */
    temperature: z.number().default(0.3).optional(),
    max_tokens: z
      .number()
      .int()
      .nullish()
      .default(Math.min(OPENAI_OUTPUT_MAX, 4096))
      .transform((v) => Math.min(v ?? OPENAI_OUTPUT_MAX, OPENAI_OUTPUT_MAX)),
    max_input_tokens: z.number().int().optional(),
    k: z.number().int().min(0).max(500).default(0).optional(),
    p: z.number().min(0.01).max(0.99).default(0.75).optional(),
    seed: z.number().int().optional(),
    stop_sequences: z.array(z.string()).max(5).optional(),
    frequency_penalty: z.number().min(0).max(1).default(0).optional(),
    presence_penalty: z.number().min(0).max(1).default(0).optional(),
    tools: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          parameter_definitions: z.record(
            z.object({
              description: z.string().optional(),
              type: z.string(),
              required: z.boolean().optional().default(false),
            })
          ),
        })
      )
      .optional(),
    tool_results: z
      .array(
        z.object({
          call: z.object({
            name: z.string(),
            parameters: z.record(z.any()),
          }),
          outputs: z.array(z.record(z.any())),
        })
      )
      .optional(),
    // We always force single step to avoid stateful calls or expensive multi-step
    // generations when tools are involved.
    force_single_step: z.literal(true).default(true).optional(),
  })
  .strip();
export type CohereChatMessage = NonNullable<
  z.infer<typeof CohereV1ChatSchema>["chat_history"]
>[number];

export function flattenCohereMessageContent(
  message: CohereChatMessage
): string {
  return message.role === "TOOL"
    ? message.tool_results.map((r) => r.outputs[0].text).join("\n")
    : message.message;
}

export const transformOpenAIToCohere: APIFormatTransformer<
  typeof CohereV1ChatSchema
> = async (req) => {
  const { body } = req;
  const result = OpenAIV1ChatCompletionSchema.safeParse({
    ...body,
    model: "gpt-3.5-turbo",
  });
  if (!result.success) {
    req.log.warn(
      { issues: result.error.issues, body },
      "Invalid OpenAI-to-Cohere request"
    );
    throw result.error;
  }

  const { messages, ...rest } = result.data;
  // Final OAI message becomes the `message` field in Cohere
  const message = messages[messages.length - 1];
  // If the first message has system role, use it as preamble.
  const hasSystemPreamble = messages[0]?.role === "system";
  const preamble = hasSystemPreamble
    ? flattenOpenAIMessageContent(messages[0].content)
    : undefined;

  const chatHistory = messages.slice(0, -1).map((m) => {
    const role: Exclude<CohereChatMessage["role"], "TOOL"> =
      m.role === "assistant"
        ? "CHATBOT"
        : m.role === "system"
        ? "SYSTEM"
        : "USER";
    const content = flattenOpenAIMessageContent(m.content);
    const message = m.name ? `${m.name}: ${content}` : content;
    return { role, message };
  });

  return {
    model: rest.model,
    preamble,
    chat_history: chatHistory,
    message: flattenOpenAIMessageContent(message.content),
    stop_sequences:
      typeof rest.stop === "string" ? [rest.stop] : rest.stop ?? undefined,
    max_tokens: rest.max_tokens,
    temperature: rest.temperature,
    p: rest.top_p,
    frequency_penalty: rest.frequency_penalty,
    presence_penalty: rest.presence_penalty,
    seed: rest.seed,
    stream: rest.stream,
  };
};
