import type firebase from "firebase-admin";
import { getFirebaseApp } from "../../../config";
import { logger } from "../../../logger";
import { KeyDeserializer, KeyStore, MemoryKeyStore, getDeserializer } from ".";
import { AIService, BaseSerializableKey } from "..";

export class FirebaseKeyStore<K extends BaseSerializableKey>
  implements KeyStore<K>
{
  private db: firebase.database.Database;
  private service: AIService;
  private log: typeof logger;
  private deserializer: KeyDeserializer;

  constructor(service: AIService, app = getFirebaseApp()) {
    this.db = app.database();
    this.service = service;
    this.log = logger.child({ module: "key-store", service });
    this.deserializer = getDeserializer(service);
  }

  public async load() {
    throw new Error("Method not implemented.");
    return [];
  }

  public add(key: K) {
    throw new Error("Method not implemented.");
  }

  public update(key: K) {
    throw new Error("Method not implemented.");
  }

  private async migrate() {
    this.log.info("Migrating keys from environment to Firebase.");
    const envStore = new MemoryKeyStore(this.service);
    const keysRef = this.db.ref(`keys/${this.service}`);
    const updates: Record<string, K> = {};

    const keys = await envStore.load();

    keys.forEach((key) => {
      updates[key.key] = this.deserializer(key);
    });

    // envStore.load().then((keys) => {
    //   keys.forEach((key) => {
    //     updates[key.key] = key;
    //   });
    //   keysRef.update(updates);
    // });
  }
}
