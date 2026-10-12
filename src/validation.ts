import { SelectionInputError } from "./errors";
import type { DrawInput } from "./types";
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export function validText(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
export function validateIdentity(
  companyId: unknown,
  quarter: unknown,
): asserts companyId is string {
  if (!validText(companyId))
    throw new SelectionInputError(
      "companyId must be a nonblank, well-formed string",
    );
  if (
    typeof quarter !== "string" ||
    !/^\d{4}-Q[1-4]$/.test(quarter) ||
    quarter.startsWith("0000")
  )
    throw new SelectionInputError(
      "quarter must be YYYY-Q1 through YYYY-Q4, year 0001 through 9999",
    );
}
export function toBasisPoints(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0.01 ||
    value > 100
  )
    throw new SelectionInputError(
      "percentage must be a finite number from 0.01 through 100",
    );
  const bp = Math.round(value * 100);
  if (value !== bp / 100)
    throw new SelectionInputError(
      "percentage supports at most two decimal places",
    );
  return bp;
}
export const compareStrings = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;
export function validateDrawInput(
  value: unknown,
): DrawInput & { percentageBp: number } {
  if (!isObject(value))
    throw new SelectionInputError("draw input must be an object");
  validateIdentity(value.companyId, value.quarter);
  if ("seed" in value || "seedHex" in value)
    throw new SelectionInputError(
      "normal draw input must not contain a caller-chosen seed",
    );
  const percentageBp = toBasisPoints(value.percentage);
  if (
    !Array.isArray(value.vehicleIds) ||
    !Array.from(value.vehicleIds).every(validText)
  )
    throw new SelectionInputError(
      "vehicleIds must be an array of nonblank, well-formed strings",
    );
  const vehicleIds = [...(value.vehicleIds as string[])].sort(compareStrings);
  for (let i = 1; i < vehicleIds.length; i++)
    if (vehicleIds[i] === vehicleIds[i - 1])
      throw new SelectionInputError("vehicleIds must not contain duplicates");
  return {
    companyId: value.companyId as string,
    quarter: value.quarter as string,
    percentage: value.percentage as number,
    vehicleIds,
    percentageBp,
  };
}
