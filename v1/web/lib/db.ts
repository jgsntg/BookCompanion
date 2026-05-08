import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import path from "node:path";

// Single connection, lazily opened. Reused across requests in dev and prod.
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.join(process.cwd(), "..", "data", "library.db");
  const db = new Database(dbPath, { readonly: false });
  sqliteVec.load(db);
  db.pragma("foreign_keys = ON");
  _db = db;
  return db;
}

/** Pack a JS number array into the binary format sqlite-vec expects. */
export function serializeVector(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    buf.writeFloatLE(values[i], i * 4);
  }
  return buf;
}
