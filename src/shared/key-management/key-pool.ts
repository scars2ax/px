import crypto from "crypto";
import type * as http from "http";
import os from "os";
import schedule from "node-schedule";
import { config } from "../../config";
import { logger } from "../../logger";
import { KeyProviderBase } from "./key-provider-base";
import { getSerializer } from "./serializers";
import { FirebaseKeyStore, MemoryKeyStore } from "./stores";
import { AnthropicKeyProvider } from "./anthropic/provider";
import { OpenAIKeyProvider } from "./openai/provider";
import { GooglePalmKeyProvider } from "./palm/provider";
import { AwsBedrockKeyProvider } from "./aws/provider";
import { Key, KeyStore, LLMService, Model, ServiceToKey } from "./types";

export class KeyPool {
  private keyProviders: KeyProviderBase[] = [];
  private recheckJobs: Partial<Record<LLMService, schedule.Job | null>> = {
    openai: null,
  };

  constructor() {
    this.keyProviders.push(
      new OpenAIKeyProvider(createKeyStore("openai")),
      new AnthropicKeyProvider(createKeyStore("anthropic")),
      new GooglePalmKeyProvider(createKeyStore("google-palm")),
      new AwsBedrockKeyProvider(createKeyStore("aws"))
    );
  }

  public async init() {
    await Promise.all(this.keyProviders.map((p) => p.init()));

    const availableKeys = this.available("all");
    if (availableKeys === 0) {
      throw new Error("No keys loaded, the application cannot start.");
    }
    this.scheduleRecheck();
  }

  public get(model: Model): Key {
    const service = this.getService(model);
    return this.getKeyProvider(service).get(model);
  }

  public list(): Omit<Key, "key">[] {
    return this.keyProviders.flatMap((provider) => provider.list());
  }

  /**
   * Marks a key as disabled for a specific reason. `revoked` should be used
   * to indicate a key that can never be used again, while `quota` should be
   * used to indicate a key that is still valid but has exceeded its quota.
   */
  public disable(key: Key, reason: "quota" | "revoked"): void {
    const service = this.getKeyProvider(key.service);
    service.disable(key);
    service.update(key.hash, { isRevoked: reason === "revoked" });
    if (service instanceof OpenAIKeyProvider) {
      service.update(key.hash, { isOverQuota: reason === "quota" });
    }
  }

  public update<T extends Key>(key: T, props: Partial<T>): void {
    const service = this.getKeyProvider(key.service);
    service.update(key.hash, props);
  }

  public available(model: Model | "all" = "all"): number {
    return this.keyProviders.reduce((sum, provider) => {
      const includeProvider =
        model === "all" || this.getService(model) === provider.service;
      return sum + (includeProvider ? provider.available() : 0);
    }, 0);
  }

  public incrementUsage(key: Key, model: string, tokens: number): void {
    const provider = this.getKeyProvider(key.service);
    provider.incrementUsage(key.hash, model, tokens);
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

  public recheck(service: LLMService): void {
    if (!config.checkKeys) {
      logger.info("Skipping key recheck because key checking is disabled");
      return;
    }

    const provider = this.getKeyProvider(service);
    provider.recheck();
  }

  private getService(model: Model): LLMService {
    if (model.startsWith("gpt") || model.startsWith("text-embedding-ada")) {
      // https://platform.openai.com/docs/models/model-endpoint-compatibility
      return "openai";
    } else if (model.startsWith("claude-")) {
      // https://console.anthropic.com/docs/api/reference#parameters
      return "anthropic";
    } else if (model.includes("bison")) {
      // https://developers.generativeai.google.com/models/language
      return "google-palm";
    } else if (model.startsWith("anthropic.claude")) {
      // AWS offers models from a few providers
      // https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids-arns.html
      return "aws";
    }
    throw new Error(`Unknown service for model '${model}'`);
  }

  private getKeyProvider(service: LLMService): KeyProviderBase {
    return this.keyProviders.find((provider) => provider.service === service)!;
  }

  /**
   * Schedules a periodic recheck of OpenAI keys, which runs every 8 hours on
   * a schedule offset by the server's hostname.
   */
  private scheduleRecheck(): void {
    const machineHash = crypto
      .createHash("sha256")
      .update(os.hostname())
      .digest("hex");
    const offset = parseInt(machineHash, 16) % 7;
    const hour = [0, 8, 16].map((h) => h + offset).join(",");
    const crontab = `0 ${hour} * * *`;

    const job = schedule.scheduleJob(crontab, () => {
      const next = job.nextInvocation();
      logger.info({ next }, "Performing periodic recheck of OpenAI keys");
      this.recheck("openai");
    });
    logger.info(
      { rule: crontab, next: job.nextInvocation() },
      "Scheduled periodic key recheck job"
    );
    this.recheckJobs.openai = job;
  }
}

function createKeyStore<S extends LLMService>(
  service: S
): KeyStore<ServiceToKey[S]> {
  const serializer = getSerializer(service);

  switch (config.persistenceProvider) {
    case "memory":
      return new MemoryKeyStore(service, serializer);
    case "firebase_rtdb":
      return new FirebaseKeyStore(service, serializer);
    default:
      throw new Error(`Unknown store type: ${config.persistenceProvider}`);
  }
}

export let keyPool: KeyPool;

export async function init() {
  keyPool = new KeyPool();
  await keyPool.init();
}
