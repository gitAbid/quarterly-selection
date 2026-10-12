import { readFileSync } from "node:fs";
import { verifyAuditBundle } from "./audit";
import { SelectionError, SelectionKeyError } from "./errors";
import { openSelectionService } from "./service";
import type { SelectionService } from "./types";
import { parseIdentity, validateDrawInput } from "./validation";

/** 0 success · 1 invalid data or operational failure · 2 usage or unreadable JSON. */
type ExitCode = 0 | 1 | 2;

interface CommandResult {
  readonly output: unknown;
  readonly exitCode: ExitCode;
}

type Command = (args: readonly string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>;

class UsageError extends Error {
  override readonly name = "UsageError";
}

const USAGE =
  "usage: cli draw --db FILE --input JSON | get|audit --db FILE --company ID --quarter YYYY-Qn | verify BUNDLE";
const KEY_VARIABLE = "FLEETCHECK_SEED_KEY";
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

const succeed = (output: unknown): CommandResult => ({ output, exitCode: 0 });

/** Command pattern: each subcommand is one small function looked up by name. */
const COMMANDS: ReadonlyMap<string, Command> = new Map<string, Command>([
  ["draw", async (args, env) => {
    const flag = parseFlags(args, ["--db", "--input"]);
    const request = validateDrawInput(readJson(flag("--input")));
    return withService(flag("--db"), env, async (service) =>
      succeed(await service.createOrGet(request)),
    );
  }],
  ["get", async (args, env) => {
    const flag = parseFlags(args, ["--db", "--company", "--quarter"]);
    const { companyId, quarter } = parseIdentity(flag("--company"), flag("--quarter"));
    return withService(flag("--db"), env, async (service) =>
      succeed((await service.get(companyId, quarter)) ?? null),
    );
  }],
  ["audit", async (args, env) => {
    const flag = parseFlags(args, ["--db", "--company", "--quarter"]);
    const { companyId, quarter } = parseIdentity(flag("--company"), flag("--quarter"));
    return withService(flag("--db"), env, async (service) =>
      succeed(await service.exportAudit(companyId, quarter)),
    );
  }],
  ["verify", async (args) => {
    const [path, ...rest] = args;
    if (!path || rest.length > 0) throw new UsageError(USAGE);
    const report = verifyAuditBundle(readJson(path));
    return { output: report, exitCode: report.ok ? 0 : 1 };
  }],
]);

export async function runCli(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const [name, ...args] = argv;
  const command = name === undefined ? undefined : COMMANDS.get(name);
  if (!command) throw new UsageError(USAGE);
  return command(args, env);
}

/** Opens the service only after all input is valid, and always closes it. */
async function withService(
  databasePath: string,
  env: NodeJS.ProcessEnv,
  use: (service: SelectionService) => Promise<CommandResult>,
): Promise<CommandResult> {
  const key = keyFromEnvironment(env);
  let service: SelectionService | undefined;
  try {
    service = openSelectionService({ databasePath, encryptionKey: key });
    return await use(service);
  } finally {
    key.fill(0);
    await service?.close();
  }
}

/** Accepts exactly the named flags, each once, each with a value. */
function parseFlags<Name extends string>(
  args: readonly string[],
  names: readonly Name[],
): (name: Name) => string {
  if (args.length !== names.length * 2) throw new UsageError(USAGE);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (
      name === undefined ||
      !names.some((allowed) => allowed === name) ||
      values.has(name) ||
      !value ||
      value.startsWith("--")
    )
      throw new UsageError(USAGE);
    values.set(name, value);
  }
  return (name) => {
    const value = values.get(name);
    if (value === undefined) throw new UsageError(USAGE);
    return value;
  };
}

function readJson(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed;
  } catch {
    throw new UsageError("cannot read or parse JSON file");
  }
}

function keyFromEnvironment(env: NodeJS.ProcessEnv): Buffer {
  const value = env[KEY_VARIABLE];
  const invalid = new SelectionKeyError(
    `${KEY_VARIABLE} must be base64 for exactly 32 bytes`,
  );
  if (value === undefined || !BASE64_32_BYTES.test(value)) throw invalid;
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw invalid;
  return key;
}

/** Only messages from our own errors are shown; anything unexpected stays generic. */
function describeFailure(error: unknown): { message: string; exitCode: ExitCode } {
  if (error instanceof UsageError) return { message: error.message, exitCode: 2 };
  if (error instanceof SelectionError) return { message: error.message, exitCode: 1 };
  return { message: "selection operation failed", exitCode: 1 };
}

runCli(process.argv.slice(2), process.env).then(
  ({ output, exitCode }) => {
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    const { message, exitCode } = describeFailure(error);
    console.error(message);
    process.exitCode = exitCode;
  },
);
