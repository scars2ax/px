import { z } from "zod";
import { Request } from "express";
import { config } from "../../config";
import {
  flattenOpenAIMessageContent,
  OpenAIChatMessage,
  OpenAIV1ChatCompletionSchema,
} from "./openai";

const CLAUDE_OUTPUT_MAX = config.maxOutputTokensAnthropic;

const AnthropicV1BaseSchema = z
  .object({
    model: z.string().max(100),
    stop_sequences: z.array(z.string().max(500)).optional(),
    stream: z.boolean().optional().default(false),
    temperature: z.coerce.number().optional().default(1),
    top_k: z.coerce.number().optional(),
    top_p: z.coerce.number().optional(),
    metadata: z.object({ user_id: z.string().optional() }).optional(),
  })
  .strip();

// https://docs.anthropic.com/claude/reference/complete_post [deprecated]
export const AnthropicV1TextSchema = AnthropicV1BaseSchema.merge(
  z.object({
    prompt: z.string(),
    max_tokens_to_sample: z.coerce
      .number()
      .int()
      .transform((v) => Math.min(v, CLAUDE_OUTPUT_MAX)),
  })
);

// https://docs.anthropic.com/claude/reference/messages_post
export const AnthropicV1MessagesSchema = AnthropicV1BaseSchema.merge(
  z.object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.union([
            z.string(),
            z.array(z.object({ type: z.string().max(100), text: z.string() })),
          ]),
        })
      )
      .min(1)
      .refine((v) => v[0].role === "user", {
        message: `First message must be have 'user' role. Use 'system' parameter to start with a system message.`,
      }),
    max_tokens: z
      .number()
      .int()
      .transform((v) => Math.min(v, CLAUDE_OUTPUT_MAX)),
    system: z.string().optional(),
  })
);
export type AnthropicChatMessage = z.infer<
  typeof AnthropicV1MessagesSchema
>["messages"][0];

export function openAIMessagesToClaudePrompt(messages: OpenAIChatMessage[]) {
  return (
    messages
      .map((m) => {
        let role: string = m.role;
        if (role === "assistant") {
          role = "Assistant";
        } else if (role === "system") {
          role = "System";
        } else if (role === "user") {
          role = "Human";
        }
        const name = m.name?.trim();
        const content = flattenOpenAIMessageContent(m.content);
        // https://console.anthropic.com/docs/prompt-design
        // `name` isn't supported by Anthropic but we can still try to use it.
        return `\n\n${role}: ${name ? `(as ${name}) ` : ""}${content}`;
      })
      .join("") + "\n\nAssistant:"
  );
}

export function openAIToAnthropic(req: Request) {
  const { body } = req;
  const result = OpenAIV1ChatCompletionSchema.safeParse(body);
  if (!result.success) {
    req.log.warn(
      { issues: result.error.issues, body },
      "Invalid OpenAI-to-Anthropic request"
    );
    throw result.error;
  }

  req.headers["anthropic-version"] = "2023-06-01";

  const { messages, ...rest } = result.data;
  const prompt = openAIMessagesToClaudePrompt(messages);

  let stops = rest.stop
    ? Array.isArray(rest.stop)
      ? rest.stop
      : [rest.stop]
    : [];
  // Recommended by Anthropic
  stops.push("\n\nHuman:");
  // Helps with jailbreak prompts that send fake system messages and multi-bot
  // chats that prefix bot messages with "System: Respond as <bot name>".
  stops.push("\n\nSystem:");
  // Remove duplicates
  stops = [...new Set(stops)];

  return {
    model: rest.model,
    prompt: prompt,
    max_tokens_to_sample: rest.max_tokens,
    stop_sequences: stops,
    stream: rest.stream,
    temperature: rest.temperature,
    top_p: rest.top_p,
  };
}

export function flattenAnthropicMessages(
  messages: AnthropicChatMessage[]
): string {
  return messages
    .map((msg) => {
      const name = msg.role === "user" ? "\n\nHuman: " : "\n\nAssistant: ";
      const parts = Array.isArray(msg.content)
        ? msg.content
        : [{ type: "text", text: msg.content }];
      return `${name}: ${parts
        .map(({ text, type }) =>
          type === "text" ? text : `[Unsupported content type: ${type}]`
        )
        .join("\n")}`;
    })
    .join("\n\n");
}
