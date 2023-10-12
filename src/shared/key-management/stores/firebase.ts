import firebase from "firebase-admin";
import { config, getFirebaseApp } from "../../../config";
import { logger } from "../../../logger";
import { assertSerializedKey } from "../serializers";
import type {
  Key,
  KeySerializer,
  KeyStore,
  LLMService,
  SerializedKey,
} from "../types";
import { MemoryKeyStore } from "./index";

export class FirebaseKeyStore<K extends Key> implements KeyStore<K> {
  private readonly db: firebase.database.Database;
  private readonly log: typeof logger;
  private readonly pendingUpdates: Map<string, Partial<SerializedKey>>;
  private readonly root: string;
  private readonly serializer: KeySerializer<K>;
  private readonly service: LLMService;
  private flushInterval: NodeJS.Timeout | null = null;
  private keysRef: firebase.database.Reference | null = null;

  constructor(
    service: LLMService,
    serializer: KeySerializer<K>,
    app = getFirebaseApp()
  ) {
    this.db = firebase.database(app);
    this.log = logger.child({ module: "firebase-key-store", service });
    this.root = `keys/${config.firebaseRtdbRoot.toLowerCase()}/${service}`;
    this.serializer = serializer;
    this.service = service;
    this.pendingUpdates = new Map();
    this.scheduleFlush();
  }

  public async load(isMigrating = false): Promise<K[]> {
    const keysRef = this.db.ref(this.root);
    const snapshot = await keysRef.once("value");
    const keys = snapshot.val();
    this.keysRef = keysRef;

    if (!keys) {
      if (isMigrating) return [];
      this.log.warn("No keys found in Firebase. Migrating from environment.");
      await this.migrate();
      return this.load(true);
    }

    return Object.values(keys).map((k) => {
      assertSerializedKey(k);
      return this.serializer.deserialize(k);
    });
  }

  public add(key: K) {
    const serialized = this.serializer.serialize(key);
    this.pendingUpdates.set(key.hash, serialized);
    this.forceFlush();
  }

  public update(id: string, update: Partial<K>, force = false) {
    const existing = this.pendingUpdates.get(id) ?? {};
    Object.assign(existing, this.serializer.partialSerialize(id, update));
    this.pendingUpdates.set(id, existing);
    if (force) this.forceFlush();
  }

  private forceFlush() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushInterval = setTimeout(() => this.flush(), 0);
  }

  private scheduleFlush() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushInterval = setInterval(() => this.flush(), 1000 * 60 * 5);
  }

  private async flush() {
    if (!this.keysRef) {
      this.log.warn(
        { pendingUpdates: this.pendingUpdates.size },
        "Database not loaded yet. Skipping flush."
      );
      return this.scheduleFlush();
    }

    if (this.pendingUpdates.size === 0) {
      this.log.debug("No pending key updates to flush.");
      return this.scheduleFlush();
    }

    const updates: Record<string, Partial<SerializedKey>> = {};
    this.pendingUpdates.forEach((v, k) => (updates[k] = v));
    this.pendingUpdates.clear();
    console.log(updates);

    await this.keysRef.update(updates);

    this.log.debug(
      { count: Object.keys(updates).length },
      "Flushed pending key updates."
    );
    this.scheduleFlush();
  }

  private async migrate(): Promise<SerializedKey[]> {
    const keysRef = this.db.ref(this.root);
    const envStore = new MemoryKeyStore<K>(this.service, this.serializer);
    const keys = await envStore.load();

    if (keys.length === 0) {
      this.log.warn("No keys found in environment or Firebase.");
      return [];
    }

    const updates: Record<string, SerializedKey> = {};
    keys.forEach((k) => (updates[k.hash] = this.serializer.serialize(k)));
    await keysRef.update(updates);

    this.log.info({ count: keys.length }, "Migrated keys from environment.");
    return Object.values(updates);
  }
}
