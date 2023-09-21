import { Key } from "..";

export interface KeyStore<K extends Key> {
  load(): Promise<SerializedKey[]>;
  add(key: K): void;
  update(id: string, update: Partial<K>, force?: boolean): void;
}

export interface KeySerializer<K> {
  serialize(key: K): SerializedKey;
  deserialize(key: SerializedKey): K;
}

export type SerializedKey = { key: string };

export function assertSerializableKey(
  data: unknown
): asserts data is SerializedKey {
  if (
    typeof data !== "object" ||
    !data ||
    typeof (data as any).key !== "string"
  ) {
    throw new Error("Invalid serialized key data");
  }
}

export { FirebaseKeyStore } from "./firebase";
export { MemoryKeyStore } from "./memory";
