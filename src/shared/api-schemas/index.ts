import type { Request } from "express";
import { z } from "zod";
import { APIFormat } from "../key-management";
import {
  AnthropicV1TextSchema,
  AnthropicV1MessagesSchema,
  transformAnthropicTextToAnthropicChat,
  transformOpenAIToAnthropicText,
  transformOpenAIToAnthropicChat,
} from "./anthropic";
import { OpenAIV1ChatCompletionSchema } from "./openai";
import {
  OpenAIV1TextCompletionSchema,
  transformOpenAIToOpenAIText,
} from "./openai-text";
import {
  OpenAIV1ImagesGenerationSchema,
  transformOpenAIToOpenAIImage,
} from "./openai-image";
import {
  GoogleAIV1GenerateContentSchema,
  transformOpenAIToGoogleAI,
} from "./google-ai";
import { MistralAIV1ChatCompletionsSchema } from "./mistral-ai";
import { CohereV1ChatSchema, transformOpenAIToCohere } from "./cohere";

export { OpenAIChatMessage } from "./openai";
export {
  AnthropicChatMessage,
  AnthropicV1TextSchema,
  AnthropicV1MessagesSchema,
  flattenAnthropicMessages,
} from "./anthropic";
export { GoogleAIChatMessage } from "./google-ai";
export { MistralAIChatMessage } from "./mistral-ai";

/** Represents a pair of API formats that can be transformed between. */
type APIPair = `${APIFormat}->${APIFormat}`;
/** Represents a map of API format pairs to transformer functions. */
type TransformerMap = {
  [key in APIPair]?: APIFormatTransformer<any>;
};

/**
 * Represents a transformer function that takes a Request and returns a Promise
 * resolving to a value of the specified Zod schema type.
 *
 * @template Z The Zod schema type to transform the request into (from api-schemas).
 * @param req The incoming Request to transform.
 * @returns A Promise resolving to the transformed request body.
 */
export type APIFormatTransformer<Z extends z.ZodType<any, any>> = (
  req: Request
) => Promise<z.infer<Z>>;

/**
 * Specifies possible translations between API formats and the corresponding
 * transformer functions to apply them.
 */
export const API_REQUEST_TRANSFORMERS: TransformerMap = {
  "anthropic-text->anthropic-chat": transformAnthropicTextToAnthropicChat,
  "openai->anthropic-chat": transformOpenAIToAnthropicChat,
  "openai->anthropic-text": transformOpenAIToAnthropicText,
  "openai->openai-text": transformOpenAIToOpenAIText,
  "openai->openai-image": transformOpenAIToOpenAIImage,
  "openai->google-ai": transformOpenAIToGoogleAI,
  "openai->cohere-chat": transformOpenAIToCohere,
};

/**
 * Specifies the schema for each API format to validate incoming requests.
 */
export const API_REQUEST_VALIDATORS: Record<APIFormat, z.ZodSchema<any>> = {
  "anthropic-chat": AnthropicV1MessagesSchema,
  "anthropic-text": AnthropicV1TextSchema,
  openai: OpenAIV1ChatCompletionSchema,
  "openai-text": OpenAIV1TextCompletionSchema,
  "openai-image": OpenAIV1ImagesGenerationSchema,
  "google-ai": GoogleAIV1GenerateContentSchema,
  "mistral-ai": MistralAIV1ChatCompletionsSchema,
  "cohere-chat": CohereV1ChatSchema,
};
