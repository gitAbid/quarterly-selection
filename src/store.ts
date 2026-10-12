import Database from "better-sqlite3";
import { chmodSync } from "node:fs";
import { SelectionStorageError } from "./errors";
import type { SelectionRunRecord } from "./types";
import type { EncryptedSeed } from "./crypto";
export interface StoredRun {
  record: SelectionRunRecord;
  encrypted: EncryptedSeed;
}
export class SqliteStore {
  private db: Database.Database;
  constructor(path: string) {
    let db: Database.Database | undefined;
    try {
      if (typeof path !== "string" || !path.trim() || path === ":memory:")
        throw new Error("A durable file path is required");
      db = new Database(path, { timeout: 5000 });
      this.db = db;
      const version = db.pragma("user_version", { simple: true });
      if (version !== 0 && version !== 1) throw new Error("Unsupported schema");
      chmodSync(path, 0o600);
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = FULL");
      db.exec(`CREATE TABLE IF NOT EXISTS selection_runs (
        company_id TEXT NOT NULL, quarter TEXT NOT NULL, public_record TEXT NOT NULL,
        seed_ciphertext BLOB NOT NULL, seed_nonce BLOB NOT NULL, seed_tag BLOB NOT NULL,
        schema_version INTEGER NOT NULL CHECK(schema_version = 1), PRIMARY KEY(company_id,quarter)
      ) WITHOUT ROWID`);
      if (version === 0) db.pragma("user_version = 1");
    } catch (e) {
      db?.close();
      throw storageError(e);
    }
  }
  read(companyId: string, quarter: string): StoredRun | undefined {
    try {
      const row = this.db
        .prepare(
          "SELECT * FROM selection_runs WHERE company_id=? AND quarter=?",
        )
        .get(companyId, quarter) as
        | {
            company_id: string;
            quarter: string;
            public_record: string;
            seed_ciphertext: Buffer;
            seed_nonce: Buffer;
            seed_tag: Buffer;
            schema_version: number;
          }
        | undefined;
      if (!row) return undefined;
      const record = JSON.parse(row.public_record) as SelectionRunRecord;
      if (
        !record ||
        record.companyId !== row.company_id ||
        record.quarter !== row.quarter ||
        record.algorithmVersion !== "v2" ||
        row.schema_version !== 1
      )
        throw new Error("Invalid persisted record");
      return {
        record,
        encrypted: {
          ciphertext: row.seed_ciphertext,
          nonce: row.seed_nonce,
          tag: row.seed_tag,
        },
      };
    } catch (e) {
      throw storageError(e);
    }
  }
  insertOrGet(candidate: StoredRun): { stored: StoredRun; inserted: boolean } {
    try {
      return this.db
        .transaction(() => {
          const { record, encrypted } = candidate;
          const result = this.db
            .prepare(
              `INSERT INTO selection_runs VALUES (?,?,?,?,?,?,1) ON CONFLICT(company_id,quarter) DO NOTHING`,
            )
            .run(
              record.companyId,
              record.quarter,
              JSON.stringify(record),
              encrypted.ciphertext,
              encrypted.nonce,
              encrypted.tag,
            );
          const stored = this.read(record.companyId, record.quarter);
          if (!stored) throw new Error("Committed record unavailable");
          return { stored, inserted: result.changes === 1 };
        })
        .immediate();
    } catch (e) {
      throw storageError(e);
    }
  }
  close() {
    if (this.db.open) this.db.close();
  }
}
function storageError(e: unknown): SelectionStorageError {
  if (e instanceof SelectionStorageError) return e;
  const code =
    typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
  const retryable =
    code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED");
  return new SelectionStorageError(
    retryable
      ? "selection storage is busy; retry the request"
      : "selection storage operation failed",
    retryable,
  );
}
