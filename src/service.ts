import { randomBytes } from "node:crypto";
import { copyKey, decryptSeed, encryptSeed } from "./crypto";
import {
  SelectionInputError,
  SelectionNotFoundError,
  SelectionStorageError,
} from "./errors";
import { commitSeed, replaySelection, snapshotHash } from "./selection";
import {
  algorithmDescription,
  validateRunRecord,
  verifyAuditBundle,
} from "./audit";
import { SqliteStore, type StoredRun } from "./store";
import type {
  DrawInput,
  RunOutcome,
  SelectionRunRecord,
  SelectionService,
} from "./types";
import { validateDrawInput, validateIdentity } from "./validation";
export interface ServiceOptions {
  databasePath: string;
  encryptionKey: Uint8Array;
  now?: () => Date;
}
export function openSelectionService(
  options: ServiceOptions,
): SelectionService {
  const key = copyKey(options?.encryptionKey),
    store = new SqliteStore(options.databasePath);
  let closed = false;
  const ensureOpen = () => {
    if (closed) throw new SelectionStorageError("selection service is closed");
  };
  const auditFor = (stored: StoredRun) => {
    try {
      validateRunRecord(stored.record);
    } catch {
      throw new SelectionStorageError(
        "persisted selection evidence is invalid",
      );
    }
    const bundle = {
      record: stored.record,
      revealedSeed: decryptSeed(stored.encrypted, key, stored.record),
      algorithm: algorithmDescription(stored.record.algorithmVersion),
    };
    if (!verifyAuditBundle(bundle).ok)
      throw new SelectionStorageError(
        "persisted selection evidence is inconsistent",
      );
    return bundle;
  };
  const matches = (
    record: SelectionRunRecord,
    input: DrawInput & { percentageBp: number },
  ) =>
    record.snapshotSha256 === snapshotHash(input.vehicleIds) &&
    record.percentageBp === input.percentageBp;
  return {
    async createOrGet(input: DrawInput): Promise<RunOutcome> {
      ensureOpen();
      const valid = validateDrawInput(input);
      const existing = store.read(valid.companyId, valid.quarter);
      if (existing) {
        auditFor(existing);
        return {
          record: existing.record,
          reused: true,
          inputsMatch: matches(existing.record, valid),
        };
      }
      const seed = randomBytes(32).toString("hex");
      const result = replaySelection(valid, seed);
      const date = options.now?.() ?? new Date();
      if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
        throw new SelectionInputError("clock must return a valid date");
      const record: SelectionRunRecord = {
        ...result,
        commitment: commitSeed(seed, "v2"),
        eligibleVehicleIds: [...valid.vehicleIds],
        createdAt: date.toISOString(),
      };
      const { stored, inserted } = store.insertOrGet({
        record,
        encrypted: encryptSeed(seed, key, record),
      });
      auditFor(stored);
      return {
        record: stored.record,
        reused: !inserted,
        inputsMatch: matches(stored.record, valid),
      };
    },
    async get(companyId, quarter) {
      ensureOpen();
      validateIdentity(companyId, quarter);
      const stored = store.read(companyId, quarter);
      if (!stored) return undefined;
      auditFor(stored);
      return stored.record;
    },
    async exportAudit(companyId, quarter) {
      ensureOpen();
      validateIdentity(companyId, quarter);
      const stored = store.read(companyId, quarter);
      if (!stored)
        throw new SelectionNotFoundError(
          "no selection exists for this company and quarter",
        );
      return auditFor(stored);
    },
    async close() {
      if (!closed) {
        store.close();
        key.fill(0);
        closed = true;
      }
    },
  };
}
