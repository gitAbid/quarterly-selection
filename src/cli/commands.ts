import type { SelectionService } from "../application/selection-service";
import { openSelectionService } from "../bootstrap/open-selection-service";
import { verifyAuditBundle } from "../domain/audit-verification";
import { parseIdentity, validateDrawInput } from "../domain/validation";
import { parseFlags, readJsonFile } from "./arguments";
import { keyFromEnvironment } from "./environment";
import { USAGE, UsageError } from "./failures";
import type { Command, CommandResult } from "./types";

const IDENTITY_FLAGS = ["--db", "--company", "--quarter"] as const;

const draw: Command = async (args, env) => {
  const flag = parseFlags(args, ["--db", "--input"]);
  const request = validateDrawInput(readJsonFile(flag("--input")));
  return withService(flag("--db"), env, async (service) => succeed(await service.createOrGet(request)));
};

const get: Command = async (args, env) => {
  const flag = parseFlags(args, IDENTITY_FLAGS);
  const { companyId, quarter } = parseIdentity(flag("--company"), flag("--quarter"));
  return withService(flag("--db"), env, async (service) => succeed((await service.get(companyId, quarter)) ?? null));
};

const audit: Command = async (args, env) => {
  const flag = parseFlags(args, IDENTITY_FLAGS);
  const { companyId, quarter } = parseIdentity(flag("--company"), flag("--quarter"));
  return withService(flag("--db"), env, async (service) => succeed(await service.exportAudit(companyId, quarter)));
};

const verify: Command = async (args) => {
  const [path, ...rest] = args;
  if (!path || rest.length > 0) throw new UsageError(USAGE);
  const report = verifyAuditBundle(readJsonFile(path));
  return { output: report, exitCode: report.ok ? 0 : 1 };
};

/** Command pattern: a Map, so names like "toString" can't reach Object.prototype. */
const COMMANDS: ReadonlyMap<string, Command> = new Map([
  ["draw", draw],
  ["get", get],
  ["audit", audit],
  ["verify", verify],
]);

export async function runCli(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
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

function succeed(output: unknown): CommandResult {
  return { output, exitCode: 0 };
}
