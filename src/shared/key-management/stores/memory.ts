import { assertNever } from "../../utils";
import { LLMService, Key, KeySerializer } from "../index";
import { KeyStore } from ".";

export class MemoryKeyStore<K extends Key> implements KeyStore<K> {
  private readonly env: string;
  private readonly serializer: KeySerializer<K>;

  constructor(service: LLMService, serializer: KeySerializer<K>) {
    switch (service) {
      case "anthropic":
        this.env = "ANTHROPIC_KEY";
        break;
      case "openai":
        this.env = "OPENAI_KEY";
        break;
      case "google-palm":
        this.env = "GOOGLE_PALM_KEY";
        break;
      case "aws":
        this.env = "AWS_CREDENTIALS";
        break;
      default:
        assertNever(service);
    }
    this.serializer = serializer;
  }

  public async load() {
    let envKeys: string[];
    envKeys = [
      ...new Set(process.env[this.env]?.split(",").map((k) => k.trim())),
    ];
    return envKeys
      .filter((k) => k)
      .map((k) => this.serializer.deserialize({ key: k }));
  }

  public add() {}

  public update() {}
}
