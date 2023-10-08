import firebase from "firebase-admin";
import { config, getFirebaseApp } from "../../../config";
import { logger } from "../../../logger";
import { Key, LLMService } from "..";
import { assertSerializableKey, KeySerializer, KeyStore } from ".";

export class FirebaseKeyStore<K extends Key> implements KeyStore<K> {
  private readonly db: firebase.database.Database;
  private readonly log: typeof logger;
  private readonly pendingUpdates: Map<string, Partial<K>> = new Map();
  private readonly root: string;
  private readonly serializer: KeySerializer<K>;
  private flushInterval: NodeJS.Timeout | null = null;
  private keysRef: firebase.database.Reference | null = null;

  constructor(
    service: LLMService,
    serializer: KeySerializer<K>,
    app = getFirebaseApp()
  ) {
    this.db = firebase.database(app);
    this.log = logger.child({ module: "firebase-key-store", service });
    this.root = `keys/${config.firebaseRtdbRoot}/${service}`;
    this.serializer = serializer;
    this.schedulePeriodicFlush();
  }

  public async load() {
    const keysRef = this.db.ref(this.root);
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
