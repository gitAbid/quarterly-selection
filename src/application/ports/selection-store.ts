import type { SelectionIdentity, SelectionRunRecord } from "../../domain/model";
import type { EncryptedSeed } from "./seed-cipher";

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
 * pattern). The service depends on this port, so a PostgreSQL adapter can
 * replace SQLite without changing the service.
 */
export interface SelectionStore {
  find(identity: SelectionIdentity): StoredRun | undefined;

  /** Atomically inserts the candidate unless a run already exists. */
  insertIfAbsent(candidate: StoredRun): InsertResult;

  close(): void;
}
