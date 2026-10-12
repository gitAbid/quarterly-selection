import { SelectionError, SelectionInputError } from "./errors";
import type { SelectionResult, SelectionRunRecord, VerificationReport } from "./model";
import { parseRunRecord } from "./run-record-parser";
import { commitSeed, replaySelection, snapshotHash } from "./selection";
import { isRecord } from "./validation";

/** Every check must be present and pass for a bundle to verify. */
type CheckName =
  | "algorithmSupported"
  | "commitmentMatchesSeed"
  | "snapshotHashMatches"
  | "eligibleCountMatches"
  | "selectedCountFollowsRule"
  | "selectionReproduced";

interface ParsedBundle {
  readonly record: SelectionRunRecord;
  readonly revealedSeed: string;
}

const UNEXPECTED_FAILURE = "audit bundle could not be validated";

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
      snapshotHashMatches: snapshotHash(record.eligibleVehicleIds) === record.snapshotSha256,
      eligibleCountMatches: record.eligibleVehicleIds.length === record.eligibleCount,
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
    const message = error instanceof SelectionError ? error.message : UNEXPECTED_FAILURE;
    return { ok: false, checks: {}, errors: [message] };
  }
}

function parseBundle(bundle: unknown): ParsedBundle {
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

function sameSelection(computed: SelectionResult, record: SelectionRunRecord): boolean {
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
