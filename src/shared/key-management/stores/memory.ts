import { KeyDeserializer, KeyStore, getDeserializer } from ".";
import { APIFormat, BaseSerializableKey } from "..";

export class MemoryKeyStore<K extends BaseSerializableKey>
  implements KeyStore<K>
{
  private env: string;
  private deserializer: KeyDeserializer;

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
    this.deserializer = getDeserializer(service);
  }

  public async load() {
    let bareKeys: string[];
    bareKeys = [
      ...new Set(process.env[this.env]?.split(",").map((k) => k.trim())),
    ];
    return bareKeys.map((key) => this.deserializer({ key }));
  }

  public add(_key: K) {}

  public update(_key: K) {}
}
