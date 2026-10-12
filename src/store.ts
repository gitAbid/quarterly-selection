import Database from "better-sqlite3";
import { chmodSync } from "node:fs";
import type { EncryptedSeed } from "./crypto";
import { SelectionStorageError } from "./errors";
import { parseRunRecord } from "./record";
import type { SelectionIdentity, SelectionRunRecord } from "./types";

export interface StoredRun {
  readonly record: SelectionRunRecord;
  readonly encrypted: EncryptedSeed;
}

export interface InsertResult {
  /** The committed run: the candidate if it won, otherwise the existing one. */
  readonly stored: StoredRun;
  readonly inserted: boolean;
}

/**
 * Durable storage with at most one run per company and quarter (repository
 * pattern). The service depends on this interface, so a PostgreSQL store can
 * replace SQLite without changing the service.
 */
export interface SelectionStore {
  find(identity: SelectionIdentity): StoredRun | undefined;
  /** Atomically inserts the candidate unless a run already exists. */
  insertIfAbsent(candidate: StoredRun): InsertResult;
  close(): void;
}

const SCHEMA_VERSION = 1;
const BUSY_TIMEOUT_MS = 5000;

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS selection_runs (
  company_id TEXT NOT NULL, quarter TEXT NOT NULL, public_record TEXT NOT NULL,
  seed_ciphertext BLOB NOT NULL, seed_nonce BLOB NOT NULL, seed_tag BLOB NOT NULL,
  schema_version INTEGER NOT NULL CHECK(schema_version = 1), PRIMARY KEY(company_id,quarter)
) WITHOUT ROWID`;
const SELECT_RUN =
  "SELECT * FROM selection_runs WHERE company_id=? AND quarter=?";
const INSERT_RUN = `INSERT INTO selection_runs VALUES (?,?,?,?,?,?,${SCHEMA_VERSION})
  ON CONFLICT(company_id,quarter) DO NOTHING`;

interface SelectionRow {
  company_id: string;
  quarter: string;
  public_record: string;
  seed_ciphertext: Buffer;
  seed_nonce: Buffer;
  seed_tag: Buffer;
  schema_version: number;
}

type IdentityParams = [companyId: string, quarter: string];
type InsertParams = [
  companyId: string,
  quarter: string,
  publicRecord: string,
  ciphertext: Buffer,
  nonce: Buffer,
  tag: Buffer,
];

export class SqliteSelectionStore implements SelectionStore {
  private readonly db: Database.Database;
  private readonly selectRun: Database.Statement<IdentityParams, unknown>;
  private readonly insertRun: Database.Statement<InsertParams, unknown>;

  /** Opens or creates the database file. Fails rather than falling back to memory. */
  constructor(path: string) {
    let db: Database.Database | undefined;
    try {
      if (typeof path !== "string" || !path.trim() || path === ":memory:")
        throw new Error("a durable file path is required");
      db = new Database(path, { timeout: BUSY_TIMEOUT_MS });
      const version: unknown = db.pragma("user_version", { simple: true });
      if (version !== 0 && version !== SCHEMA_VERSION)
        throw new Error("unsupported schema version");
      chmodSync(path, 0o600);
      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = FULL");
      db.exec(CREATE_TABLE);
      if (version === 0) db.pragma(`user_version = ${SCHEMA_VERSION}`);
      this.selectRun = db.prepare<IdentityParams, unknown>(SELECT_RUN);
      this.insertRun = db.prepare<InsertParams, unknown>(INSERT_RUN);
      this.db = db;
    } catch (error) {
      db?.close();
      throw toStorageError(error);
    }
  }

  find({ companyId, quarter }: SelectionIdentity): StoredRun | undefined {
    try {
      const row: unknown = this.selectRun.get(companyId, quarter);
      return row === undefined ? undefined : decodeRow(row);
    } catch (error) {
      throw toStorageError(error);
    }
  }

  insertIfAbsent(candidate: StoredRun): InsertResult {
    const { record, encrypted } = candidate;
    try {
      return this.db
        .transaction((): InsertResult => {
          const { changes } = this.insertRun.run(
            record.companyId,
            record.quarter,
            JSON.stringify(record),
            encrypted.ciphertext,
            encrypted.nonce,
            encrypted.tag,
          );
          const stored = this.find(record);
          if (!stored) throw new Error("committed run is unavailable");
          return { stored, inserted: changes === 1 };
        })
        .immediate();
    } catch (error) {
      throw toStorageError(error);
    }
  }

  close(): void {
    if (this.db.open) this.db.close();
  }
}

function isSelectionRow(row: unknown): row is SelectionRow {
  if (typeof row !== "object" || row === null) return false;
  const r: Partial<Record<keyof SelectionRow, unknown>> = row;
  return (
    typeof r.company_id === "string" &&
    typeof r.quarter === "string" &&
    typeof r.public_record === "string" &&
    Buffer.isBuffer(r.seed_ciphertext) &&
    Buffer.isBuffer(r.seed_nonce) &&
    Buffer.isBuffer(r.seed_tag) &&
    r.schema_version === SCHEMA_VERSION
  );
}

/** Only v2 runs are ever written, so anything else in the table is corrupt. */
function decodeRow(row: unknown): StoredRun {
  try {
    if (!isSelectionRow(row)) throw new Error("malformed row");
    const record = parseRunRecord(JSON.parse(row.public_record));
    if (
      record.companyId !== row.company_id ||
      record.quarter !== row.quarter ||
      record.algorithmVersion !== "v2"
    )
      throw new Error("record does not match its row");
    return {
      record,
      encrypted: {
        ciphertext: row.seed_ciphertext,
        nonce: row.seed_nonce,
        tag: row.seed_tag,
      },
    };
  } catch (cause) {
    throw new SelectionStorageError(
      "persisted selection evidence is invalid",
      false,
      { cause },
    );
  }
}

/** Hides raw SQLite messages; marks lock contention as safe to retry. */
function toStorageError(error: unknown): SelectionStorageError {
  if (error instanceof SelectionStorageError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  const retryable =
    code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED");
  return new SelectionStorageError(
    retryable
      ? "selection storage is busy; retry the request"
      : "selection storage operation failed",
    retryable,
    { cause: error },
  );
}
