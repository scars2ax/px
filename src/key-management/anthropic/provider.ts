import { KeyProvider } from "..";

export type AnthropicModel = "claude-v1" | "claude-instant-v1";
export const ANTHROPIC_SUPPORTED_MODELS: readonly AnthropicModel[] = [
  "claude-instant-v1",
  "claude-v1",
] as const;

export class AnthropicKeyProvider implements KeyProvider {
  // @ts-ignore
  async get(model: AnthropicModel) {
    throw new Error("Method not implemented.");
  }
  // @ts-ignore
  async list() {
    throw new Error("Method not implemented.");
  }
  // @ts-ignore
  async disable(key: any) {
    throw new Error("Method not implemented.");
  }
  // @ts-ignore
  async available() {
    throw new Error("Method not implemented.");
  }
  // @ts-ignore
  async anyUnchecked() {
    throw new Error("Method not implemented.");
  }
  // @ts-ignore
  async getLockoutPeriod(model: AnthropicModel) {
    throw new Error("Method not implemented.");
  }
  // @ts-ignore
  async remainingQuota() {
    throw new Error("Method not implemented.");
  }
  // @ts-ignore
  async usageInUsd() {
    throw new Error("Method not implemented.");
  }
}
