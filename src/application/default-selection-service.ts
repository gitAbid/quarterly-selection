import { randomBytes } from "node:crypto";
import { CURRENT_ALGORITHM } from "../domain/algorithms/registry";
import { SelectionInputError, SelectionNotFoundError, SelectionStorageError } from "../domain/errors";
import type { AuditBundle, DrawInput, SelectionRunRecord, ValidatedDrawInput } from "../domain/model";
import { commitSeed, replaySelection, snapshotHash } from "../domain/selection";
import { parseIdentity, validateDrawInput } from "../domain/validation";
import { openAuditBundle } from "./audit-bundle";
import type { SeedCipher, SelectionStore, StoredRun } from "./ports";
import type { RunOutcome, SelectionService } from "./selection-service";

/** Everything the service needs, passed in so each part can be swapped or faked. */
export interface SelectionServiceDependencies {
  readonly store: SelectionStore;
  readonly cipher: SeedCipher;
  readonly clock?: () => Date;
  readonly generateSeed?: () => string;
}

const SEED_BYTES = 32;

/**
 * One draw per company and quarter. A draw is computed outside the write
 * transaction, inserted only if none exists, and every run returned is first
 * checked to replay exactly.
 */
export class DefaultSelectionService implements SelectionService {
  private readonly store: SelectionStore;
  private readonly cipher: SeedCipher;
  private readonly clock: () => Date;
  private readonly generateSeed: () => string;
  private closed = false;

  constructor(deps: SelectionServiceDependencies) {
    this.store = deps.store;
    this.cipher = deps.cipher;
    this.clock = deps.clock ?? (() => new Date());
    this.generateSeed = deps.generateSeed ?? randomSeed;
  }

  async createOrGet(input: DrawInput): Promise<RunOutcome> {
    this.ensureOpen();
    const request = validateDrawInput(input);
    const existing = this.store.find(request);
    if (existing) return this.outcome(existing, request, true);
    const { stored, inserted } = this.store.insertIfAbsent(this.newCandidate(request));
    return this.outcome(stored, request, !inserted);
  }

  async get(companyId: string, quarter: string): Promise<SelectionRunRecord | undefined> {
    this.ensureOpen();
    const stored = this.store.find(parseIdentity(companyId, quarter));
    return stored && openAuditBundle(stored, this.cipher).record;
  }

  async exportAudit(companyId: string, quarter: string): Promise<AuditBundle> {
    this.ensureOpen();
    const stored = this.store.find(parseIdentity(companyId, quarter));
    if (!stored) throw new SelectionNotFoundError("no selection exists for this company and quarter");
    return openAuditBundle(stored, this.cipher);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.store.close();
    } finally {
      this.cipher.dispose();
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new SelectionStorageError("selection service is closed");
  }

  private newCandidate(request: ValidatedDrawInput): StoredRun {
    const createdAt = this.timestamp();
    const seed = this.generateSeed();
    const record: SelectionRunRecord = {
      ...replaySelection(request, seed, CURRENT_ALGORITHM),
      commitment: commitSeed(seed, CURRENT_ALGORITHM),
      eligibleVehicleIds: [...request.vehicleIds],
      createdAt,
    };
    return { record, encrypted: this.cipher.encrypt(seed, record) };
  }

  private timestamp(): string {
    const date: unknown = this.clock();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
      throw new SelectionInputError("clock must return a valid date");
    return date.toISOString();
  }

  /** Verifies the run, then reports whether it was drawn from this exact request. */
  private outcome(stored: StoredRun, request: ValidatedDrawInput, reused: boolean): RunOutcome {
    const { record } = openAuditBundle(stored, this.cipher);
    return {
      record,
      reused,
      inputsMatch:
        record.snapshotSha256 === snapshotHash(request.vehicleIds) && record.percentageBp === request.percentageBp,
    };
  }
}

function randomSeed(): string {
  return randomBytes(SEED_BYTES).toString("hex");
}
