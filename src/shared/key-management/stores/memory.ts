import { Key, KeyStore } from "..";

export class MemoryKeyStore<K extends Pick<Key, "key">> implements KeyStore<K> {
  constructor() {}

  public async load() {
    // TODO: load from process.env
    return [];
  }

  public add(_key: K) {}

  public update(_key: K) {}
}
