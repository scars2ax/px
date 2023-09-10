import { APIFormat, Key, KeyStore } from "..";

export class MemoryKeyStore<K extends Pick<Key, "key">> implements KeyStore<K> {
  private env: string;

  constructor(service: APIFormat) {
    switch (service) {
      case "anthropic":
        this.env = "ANTHROPIC_KEY";
        break;
      case "openai":
      case "openai-text":
        this.env = "OPENAI_KEY";
        break;
      case "google-palm":
        this.env = "GOOGLE_PALM_KEY";
        break;
      default:
        const never: never = service;
        throw new Error(`Unknown service: ${never}`);
    }
  }

  public async load() {
    let bareKeys: string[];
    bareKeys = [
      ...new Set(process.env[this.env]?.split(",").map((k) => k.trim())),
    ];
    return bareKeys.map((key) => ({ key } as K));
  }

  public add(_key: K) {}

  public update(_key: K) {}
}
