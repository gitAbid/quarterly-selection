import { SelectionInputError } from "./errors";
import type { SelectionIdentity, ValidatedDrawInput } from "./model";

const QUARTER = /^\d{4}-Q[1-4]$/;
const MIN_PERCENTAGE = 0.01;
const MAX_PERCENTAGE = 100;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A nonblank string with no lone UTF-16 surrogates. */
export function isWellFormedText(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** Rejects sparse arrays too: Array.from turns holes into undefined. */
export function isWellFormedTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && Array.from(value).every(isWellFormedText);
}

/** Locale-independent ordering by UTF-16 code units. */
export function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function parseIdentity(companyId: unknown, quarter: unknown): SelectionIdentity {
  if (!isWellFormedText(companyId)) throw new SelectionInputError("companyId must be a nonblank, well-formed string");
  if (typeof quarter !== "string" || !QUARTER.test(quarter) || quarter.startsWith("0000"))
    throw new SelectionInputError("quarter must be YYYY-Q1 through YYYY-Q4, year 0001 through 9999");
  return { companyId, quarter };
}

/** Converts a percentage with at most two decimals into integer basis points. */
export function toBasisPoints(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_PERCENTAGE || value > MAX_PERCENTAGE)
    throw new SelectionInputError("percentage must be a finite number from 0.01 through 100");
  const basisPoints = Math.round(value * 100);
  if (value !== basisPoints / 100) throw new SelectionInputError("percentage supports at most two decimal places");
  return basisPoints;
}

/** Returns sorted, duplicate-free copies; never mutates the caller's array. */
export function canonicalVehicleIds(value: unknown): string[] {
  if (!isWellFormedTextArray(value))
    throw new SelectionInputError("vehicleIds must be an array of nonblank, well-formed strings");
  const ids = [...value].sort(compareCodeUnits);
  for (let i = 1; i < ids.length; i++)
    if (ids[i] === ids[i - 1]) throw new SelectionInputError("vehicleIds must not contain duplicates");
  return ids;
}

export function validateDrawInput(value: unknown): ValidatedDrawInput {
  if (!isRecord(value)) throw new SelectionInputError("draw input must be an object");
  const { companyId, quarter } = parseIdentity(value.companyId, value.quarter);
  if ("seed" in value || "seedHex" in value)
    throw new SelectionInputError("normal draw input must not contain a caller-chosen seed");
  const percentageBp = toBasisPoints(value.percentage);
  return {
    companyId,
    quarter,
    percentage: percentageBp / 100,
    percentageBp,
    vehicleIds: canonicalVehicleIds(value.vehicleIds),
  };
}
