import type * as http from "http";
import { AnthropicKeyProvider, AnthropicKeyUpdate } from "./anthropic/provider";
import { Key, Model, KeyProvider, AIService } from "./index";
import { OpenAIKeyProvider, OpenAIKeyUpdate } from "./openai/provider";

type AllowedPartial = OpenAIKeyUpdate | AnthropicKeyUpdate;

export class KeyPool {
  private keyProviders: KeyProvider[] = [];

  constructor() {
    this.keyProviders.push(new OpenAIKeyProvider());
    this.keyProviders.push(new AnthropicKeyProvider());
  }
  
  

  public init() {
    this.keyProviders.forEach((provider) => provider.init());
    const availableKeys = this.available("all");
    if (availableKeys === 0) {
      throw new Error(
        "No keys loaded. Ensure either OPENAI_KEY or ANTHROPIC_KEY is set."
      );
    }
  }
  
  public getKeysSafely() {

	const openaiKeys = this.keyProviders[0].getAllKeys();
	const anthropipcKeys = this.keyProviders[1].getAllKeys();

	const combinedKeys = Array.prototype.concat.call(openaiKeys, anthropipcKeys);
	return combinedKeys;
  }
  
  public addKey(key: string) {
	  const openaiProvider = this.keyProviders[0]
	  const anthropicProvider = this.keyProviders[1]
	  let val = false
	  if (key.includes("sk-ant-api")) {
		val = anthropicProvider.addKey(key);
	  } else if (key.includes("sk-")) {
		val = openaiProvider.addKey(key);
	  }
	  return val;
	  
  }
  
  public deleteKeyByHash(keyHash: string) {
	const openaiProvider = this.keyProviders[0]
	const anthropicProvider = this.keyProviders[1]
	const prefix = keyHash.substring(0, 3);
	if (prefix === 'oai') {
		openaiProvider.deleteKeyByHash(keyHash);
		return true 
	} else if (prefix === 'ant') { 
    	anthropicProvider.deleteKeyByHash(keyHash);
		return true 
	} else {
		// Nothing invalid key, shouldn't be possible (Maybe in future handle error)
		return false
	}
  }
  
  
  public getHashes() {
	const combinedHashes: string[] = [];
	this.keyProviders.forEach((provider) => {
		const hashes = provider.getHashes();
		combinedHashes.push(...hashes);
	})
	
	return combinedHashes;
  }
  
  
  public recheck() {
	this.keyProviders.forEach((provider) => {
		provider.recheck();
	})
	const availableKeys = this.available("all");
  }

  public get(model: Model): Key {
    const service = this.getService(model);
    return this.getKeyProvider(service).get(model);
  }

  public list(): Omit<Key, "key">[] {
    return this.keyProviders.flatMap((provider) => provider.list());
  }

  public disable(key: Key, reason: "quota" | "revoked"): void {
    const service = this.getKeyProvider(key.service);
    service.disable(key);
    if (service instanceof OpenAIKeyProvider) {
      service.update(key.hash, {
        isRevoked: reason === "revoked",
        isOverQuota: reason === "quota",
      });
    }
  }

  public update(key: Key, props: AllowedPartial): void {
    const service = this.getKeyProvider(key.service);
    service.update(key.hash, props);
  }

  public available(service: AIService | "all" = "all"): number {
    return this.keyProviders.reduce((sum, provider) => {
      const includeProvider = service === "all" || service === provider.service;
      return sum + (includeProvider ? provider.available() : 0);
    }, 0);
  }

  public anyUnchecked(): boolean {
    return this.keyProviders.some((provider) => provider.anyUnchecked());
  }

  public incrementPrompt(key: Key): void {
    const provider = this.getKeyProvider(key.service);
    provider.incrementPrompt(key.hash);
  }

  public getLockoutPeriod(model: Model): number {
    const service = this.getService(model);
    return this.getKeyProvider(service).getLockoutPeriod(model);
  }

  public markRateLimited(key: Key): void {
    const provider = this.getKeyProvider(key.service);
    provider.markRateLimited(key.hash);
  }

  public updateRateLimits(key: Key, headers: http.IncomingHttpHeaders): void {
    const provider = this.getKeyProvider(key.service);
    if (provider instanceof OpenAIKeyProvider) {
      provider.updateRateLimits(key.hash, headers);
    }
  }

  public activeLimitInUsd(
    service: AIService,
    options?: Record<string, unknown>
  ): string {
    return this.getKeyProvider(service).activeLimitInUsd(options);
  }

  private getService(model: Model): AIService {
    if (model.startsWith("gpt")) {
      // https://platform.openai.com/docs/models/model-endpoint-compatibility
      return "openai";
    } else if (model.startsWith("claude-")) {
      // https://console.anthropic.com/docs/api/reference#parameters
      return "anthropic";
    }
    throw new Error(`Unknown service for model '${model}'`);
  }

  private getKeyProvider(service: AIService): KeyProvider {
    return this.keyProviders.find((provider) => provider.service === service)!;
  }
}
