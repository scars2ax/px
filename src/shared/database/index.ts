import type sqlite3 from "better-sqlite3";
import { config } from "../../config";

let eventDatabase: sqlite3.Database | undefined;

async function maybeInitializeEventLogging() {
  if (!config.eventLogging) {
    return;
  }

  const sqlite3 = await import("better-sqlite3");
  const db = sqlite3.default(config.eventLoggingUrl!);

  db.prepare(
    `CREATE TABLE IF NOT EXISTS events (
      date TEXT PRIMARY KEY NOT NULL,
      model TEXT NOT NULL,
      family TEXT NOT NULL,
      hashes TEXT NOT NULL,
      userToken TEXT NOT NULL,
      usage INTEGER NOT NULL
    )`
  ).run();

  eventDatabase = db;
}

export function getEventDatabase(): sqlite3.Database {
  if (!eventDatabase) {
    throw new Error("Event database not initialized.");
  }
  return eventDatabase;
}
