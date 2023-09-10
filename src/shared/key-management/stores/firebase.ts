import type firebase from "firebase-admin";
import { AIService, Key, KeyStore } from "..";
import { getFirebaseApp } from "../../../config";

export class FirebaseKeyStore<K extends Pick<Key, "key">>
  implements KeyStore<K>
{
  private db: firebase.database.Database;

  constructor(service: AIService, app = getFirebaseApp()) {
    this.db = app.database();
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
}
