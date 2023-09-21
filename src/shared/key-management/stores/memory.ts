import { assertNever } from "../../utils";
import { APIFormat, Key } from "..";
import { KeySerializer } from ".";
import { KeyStore } from ".";

export class MemoryKeyStore<K extends Key> implements KeyStore<K> {
  private env: string;

  constructor(service: APIFormat, private serializer: KeySerializer<K>) {
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
        assertNever(service);
    }
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
