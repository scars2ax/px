import { Key } from "..";

export { FirebaseKeyStore } from "./firebase";
export { MemoryKeyStore } from "./memory";

export interface KeyStore<T extends Pick<Key, "key">> {
  load(): Promise<T[]>;
  add(key: T): void;
  update(key: T): void;
}
