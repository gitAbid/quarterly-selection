import { readFileSync } from "node:fs";
import { USAGE, UsageError } from "./failures";

/**
 * Accepts exactly the named flags, each once, each with a value.
 * Returns a lookup for the parsed values.
 */
export function parseFlags<Name extends string>(
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

export function readJsonFile(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed;
  } catch {
    throw new UsageError("cannot read or parse JSON file");
  }
}
