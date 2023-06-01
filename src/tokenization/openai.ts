import { Tiktoken } from "tiktoken/lite";
import cl100k_base from "tiktoken/encoders/cl100k_base.json";

let encoder: Tiktoken;

export function init() {
  encoder = new Tiktoken(
    cl100k_base.bpe_ranks,
    cl100k_base.special_tokens,
    cl100k_base.pat_str
  );
  return true;
}

export function getTokenCount(text: string) {
  const tokens = encoder.encode(text);
  return tokens.length;
}
