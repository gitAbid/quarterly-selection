import { readFileSync } from "node:fs";
import { verifyAuditBundle } from "./audit";
import {
  SelectionInputError,
  SelectionKeyError,
  SelectionNotFoundError,
  SelectionStorageError,
} from "./errors";
import { openSelectionService } from "./service";
import { validateDrawInput, validateIdentity } from "./validation";
import type { DrawInput } from "./types";
class UsageError extends Error {}
const usage =
  "usage: cli draw --db FILE --input JSON | get|audit --db FILE --company ID --quarter YYYY-Qn | verify BUNDLE";
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new UsageError("cannot read or parse JSON file");
  }
}
function flags(args: string[], allowed: string[]): Map<string, string> {
  if (args.length !== allowed.length * 2) throw new UsageError(usage);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!,
      value = args[i + 1];
    if (
      !allowed.includes(name) ||
      values.has(name) ||
      !value ||
      value.startsWith("--")
    )
      throw new UsageError(usage);
    values.set(name, value);
  }
  if (allowed.some((name) => !values.has(name))) throw new UsageError(usage);
  return values;
}
function environmentKey(): Buffer {
  const value = process.env.FLEETCHECK_SEED_KEY;
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new SelectionKeyError(
      "FLEETCHECK_SEED_KEY must be base64 for exactly 32 bytes",
    );
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw new SelectionKeyError(
      "FLEETCHECK_SEED_KEY must be base64 for exactly 32 bytes",
    );
  return key;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "verify") {
    if (args.length !== 1 || !args[0]) throw new UsageError(usage);
    const report = verifyAuditBundle(readJson(args[0]));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
    return;
  }
  if (command !== "draw" && command !== "get" && command !== "audit")
    throw new UsageError(usage);
  const values = flags(
    args,
    command === "draw"
      ? ["--db", "--input"]
      : ["--db", "--company", "--quarter"],
  );
  const request =
    command === "draw" ? readJson(values.get("--input")!) : undefined;
  if (command === "draw") validateDrawInput(request);
  else validateIdentity(values.get("--company"), values.get("--quarter"));
  const key = environmentKey();
  let service;
  try {
    service = openSelectionService({
      databasePath: values.get("--db")!,
      encryptionKey: key,
    });
    const result =
      command === "draw"
        ? await service.createOrGet(request as DrawInput)
        : command === "get"
          ? ((await service.get(
              values.get("--company")!,
              values.get("--quarter")!,
            )) ?? null)
          : await service.exportAudit(
              values.get("--company")!,
              values.get("--quarter")!,
            );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    key.fill(0);
    await service?.close();
  }
}
main().catch((error) => {
  process.exitCode = error instanceof UsageError ? 2 : 1;
  const known =
    error instanceof UsageError ||
    error instanceof SelectionInputError ||
    error instanceof SelectionKeyError ||
    error instanceof SelectionStorageError ||
    error instanceof SelectionNotFoundError;
  console.error(known ? error.message : "selection operation failed");
});
