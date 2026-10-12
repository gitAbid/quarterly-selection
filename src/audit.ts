import { algorithmFor } from "./algorithm";
import type { SeedCipher } from "./crypto";
import {
  SelectionError,
  SelectionInputError,
  SelectionStorageError,
} from "./errors";
import { parseRunRecord } from "./record";
import { commitSeed, replaySelection, snapshotHash } from "./selection";
import type { StoredRun } from "./store";
import type {
  AuditBundle,
  SelectionResult,
  SelectionRunRecord,
  VerificationReport,
} from "./types";
import { isRecord } from "./validation";

/** Every check must be present and pass for a bundle to verify. */
type CheckName =
  | "algorithmSupported"
  | "commitmentMatchesSeed"
  | "snapshotHashMatches"
  | "eligibleCountMatches"
  | "selectedCountFollowsRule"
  | "selectionReproduced";

/**
 * Recomputes a draw from an exported audit file and compares it with what was
 * recorded. Never throws: malformed input becomes a failed report. Proves the
 * bundle is internally consistent, not that it is the original issuance.
 */
export function verifyAuditBundle(bundle: unknown): VerificationReport {
  try {
    const { record, revealedSeed } = parseBundle(bundle);
    const computed = replaySelection(
      {
        companyId: record.companyId,
        quarter: record.quarter,
        percentage: record.percentageBp / 100,
        vehicleIds: record.eligibleVehicleIds,
      },
      revealedSeed,
      record.algorithmVersion,
    );
    const checks: Record<CheckName, boolean> = {
      algorithmSupported: true,
      commitmentMatchesSeed:
        commitSeed(revealedSeed, record.algorithmVersion) === record.commitment,
      snapshotHashMatches:
        snapshotHash(record.eligibleVehicleIds) === record.snapshotSha256,
      eligibleCountMatches:
        record.eligibleVehicleIds.length === record.eligibleCount,
      selectedCountFollowsRule:
        computed.selectedCount === record.selectedCount &&
        record.selected.length === record.selectedCount,
      selectionReproduced: sameSelection(computed, record),
    };
    const errors = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => `check failed: ${name}`);
    return { ok: errors.length === 0, checks, errors };
  } catch (error) {
    return {
      ok: false,
      checks: {},
      errors: [
        error instanceof SelectionError
          ? error.message
          : "audit bundle could not be validated",
      ],
    };
  }
}

/**
 * Decrypts a stored run's seed and checks the run replays exactly before
 * anything is returned. Used on every read, so corrupt or tampered storage
 * fails loudly instead of being served.
 */
export function openAuditBundle(
  stored: StoredRun,
  cipher: SeedCipher,
): AuditBundle {
  const bundle: AuditBundle = {
    record: stored.record,
    revealedSeed: cipher.decrypt(stored.encrypted, stored.record),
    algorithm: algorithmFor(stored.record.algorithmVersion).description,
  };
  if (!verifyAuditBundle(bundle).ok)
    throw new SelectionStorageError(
      "persisted selection evidence is inconsistent",
    );
  return bundle;
}

function parseBundle(bundle: unknown): {
  record: SelectionRunRecord;
  revealedSeed: string;
} {
  if (
    !isRecord(bundle) ||
    typeof bundle.revealedSeed !== "string" ||
    typeof bundle.algorithm !== "string"
  )
    throw new SelectionInputError("audit bundle envelope is invalid");
  return {
    record: parseRunRecord(bundle.record),
    revealedSeed: bundle.revealedSeed,
  };
}

function sameSelection(
  computed: SelectionResult,
  record: SelectionRunRecord,
): boolean {
  return (
    computed.selected.length === record.selected.length &&
    computed.selected.every((expected, i) => {
      const actual = record.selected[i];
      return (
        actual !== undefined &&
        actual.vehicleId === expected.vehicleId &&
        actual.rank === expected.rank &&
        actual.score === expected.score
      );
    })
  );
}
