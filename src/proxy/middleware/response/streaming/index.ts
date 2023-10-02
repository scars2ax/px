export type SSEResponseTransformArgs = {
  data: string;
  lastPosition: number;
  index: number;
};

export type OpenAiChatCompletionStreamEvent = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }[];
}

export type StreamingResponseTransformer = (
  params: SSEResponseTransformArgs
) => { position: number; event?: OpenAiChatCompletionStreamEvent };

export { openAITextToOpenAIChat } from "./transformers/openai-text-to-openai";
export { anthropicV1ToOpenAI } from "./transformers/anthropic-v1-to-openai";
export { anthropicV2ToOpenAI } from "./transformers/anthropic-v2-to-openai";
export { mergeEventsForOpenAIChat } from "./aggregators/openai-chat";
export { mergeEventsForOpenAIText } from "./aggregators/openai-text";
export { mergeEventsForAnthropic } from "./aggregators/anthropic";

