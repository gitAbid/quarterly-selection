import { SelectionInputError } from "./errors";
import { commitSeed, replaySelection, snapshotHash } from "./selection";
import type {
  AlgorithmVersion,
  SelectionRunRecord,
  VerificationReport,
} from "./types";
import { isObject, validText, validateDrawInput } from "./validation";
const hex = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
export function validateRunRecord(value: unknown): SelectionRunRecord {
  if (!isObject(value))
    throw new SelectionInputError("audit record must be an object");
  if (value.algorithmVersion !== "v1" && value.algorithmVersion !== "v2")
    throw new SelectionInputError("unsupported algorithm version");
  if (
    !Number.isSafeInteger(value.percentageBp) ||
    Number(value.percentageBp) < 1 ||
    Number(value.percentageBp) > 10_000
  )
    throw new SelectionInputError("invalid recorded percentage");
  validateDrawInput({
    companyId: value.companyId,
    quarter: value.quarter,
    percentage: Number(value.percentageBp) / 100,
    vehicleIds: value.eligibleVehicleIds,
  });
  for (const count of [value.eligibleCount, value.selectedCount])
    if (!Number.isSafeInteger(count) || Number(count) < 0)
      throw new SelectionInputError("invalid recorded counts");
  if (!hex(value.snapshotSha256) || !hex(value.commitment))
    throw new SelectionInputError("invalid recorded hash");
  if (
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt
  )
    throw new SelectionInputError("invalid creation timestamp");
  if (
    !Array.isArray(value.selected) ||
    !Array.from(value.selected).every(
      (s) =>
        isObject(s) &&
        validText(s.vehicleId) &&
        Number.isSafeInteger(s.rank) &&
        Number(s.rank) >= 1 &&
        hex(s.score),
    )
  )
    throw new SelectionInputError("invalid selected entries");
  return value as unknown as SelectionRunRecord;
}
export function algorithmDescription(version: AlgorithmVersion): string {
  return version === "v1"
    ? "v1: UTF-8 string seed; delimiter HMAC context; ceiling basis-point count; score then code-unit ID ranking."
    : "v2: decoded 32-byte hex seed; UTF-8 compact JSON [version,company,quarter,vehicle] HMAC context; ceiling basis-point count; score then code-unit ID ranking.";
}
export function verifyAuditBundle(bundle: unknown): VerificationReport {
  const checks: Record<string, boolean> = {},
    errors: string[] = [];
  try {
    if (
      !isObject(bundle) ||
      typeof bundle.revealedSeed !== "string" ||
      typeof bundle.algorithm !== "string"
    )
      throw new SelectionInputError("audit bundle envelope is invalid");
    const record = validateRunRecord(bundle.record);
    const valid = validateDrawInput({
      companyId: record.companyId,
      quarter: record.quarter,
      percentage: record.percentageBp / 100,
      vehicleIds: record.eligibleVehicleIds,
    });
    checks.algorithmSupported = true;
    checks.commitmentMatchesSeed =
      commitSeed(bundle.revealedSeed, record.algorithmVersion) ===
      record.commitment;
    checks.snapshotHashMatches =
      snapshotHash(valid.vehicleIds) === record.snapshotSha256;
    checks.eligibleCountMatches =
      valid.vehicleIds.length === record.eligibleCount;
    const computed = replaySelection(
      valid,
      bundle.revealedSeed,
      record.algorithmVersion,
    );
    checks.selectedCountFollowsRule =
      computed.selectedCount === record.selectedCount &&
      record.selected.length === record.selectedCount;
    checks.selectionReproduced =
      computed.selected.length === record.selected.length &&
      computed.selected.every((s, i) => {
        const actual = record.selected[i];
        return (
          actual?.vehicleId === s.vehicleId &&
          actual.rank === s.rank &&
          actual.score === s.score
        );
      });
  } catch (e) {
    errors.push(
      e instanceof SelectionInputError
        ? e.message
        : "audit bundle could not be validated",
    );
  }
  for (const [name, passed] of Object.entries(checks))
    if (!passed) errors.push(`check failed: ${name}`);
  return {
    ok:
      errors.length === 0 &&
      Object.keys(checks).length === 6 &&
      Object.values(checks).every(Boolean),
    checks,
    errors,
  };
}
