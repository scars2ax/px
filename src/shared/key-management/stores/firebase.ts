import firebase from "firebase-admin";
import { getFirebaseApp } from "../../../config";
import { logger } from "../../../logger";
import { LLMService, Key } from "..";
import { KeyStore, assertSerializableKey } from ".";
import { KeySerializer } from ".";

export class FirebaseKeyStore<K extends Key> implements KeyStore<K> {
  private log: typeof logger;
  private db: firebase.database.Database;
  private keysRef: firebase.database.Reference | null = null;
  private pendingUpdates: Map<string, Partial<K>> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly service: LLMService,
    private serializer: KeySerializer<K>,
    app = getFirebaseApp()
  ) {
    this.db = firebase.database(app);
    this.service = service;
    this.log = logger.child({ module: "firebase-key-store", service });
    this.schedulePeriodicFlush();
  }

  public async load() {
    const keysRef = this.db.ref(`keys/${this.service}`);
    const snapshot = await keysRef.once("value");
    const keys = snapshot.val();

    if (!keys) {
      this.log.warn("No keys found in Firebase. Migrating from environment.");
      await this.migrate();
    }

    const values = Object.values(keys).map((k) => {
      assertSerializableKey(k);
      return this.serializer.deserialize(k);
    });

    this.keysRef = keysRef;
    return values;
  }

  public add(key: K) {
    throw new Error("Method not implemented.");
  }

  public update(id: string, update: Partial<K>, force = false) {
    const existing = this.pendingUpdates.get(id) ?? {};
    Object.assign(existing, update);
    this.pendingUpdates.set(id, existing);
    if (force) setTimeout(() => this.flush(), 0);
  }

  private schedulePeriodicFlush() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushInterval = setInterval(() => this.flush(), 1000 * 60 * 5);
  }

  private async flush() {
    if (!this.keysRef) {
      this.log.warn(
        { pendingUpdates: this.pendingUpdates.size },
        "Database not loaded yet. Skipping flush."
      );
      return;
    }
    this.schedulePeriodicFlush();
  }

  private async migrate() {
    // TODO: If firebase is empty, try instantiating a MemoryKeyStore and
    // loading keys from the environment.
  }
}
