import { Key } from "..";

export interface KeyStore<K extends Key> {
  load(): Promise<K[]>;
  add(key: K): void;
  update(id: string, update: Partial<K>, force?: boolean): void;
}

export { FirebaseKeyStore } from "./firebase";
export { MemoryKeyStore } from "./memory";
