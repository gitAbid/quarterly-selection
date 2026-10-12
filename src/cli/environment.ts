import { SelectionKeyError } from "../domain/errors";

const KEY_VARIABLE = "FLEETCHECK_SEED_KEY";
const KEY_BYTES = 32;
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

/** Reads the 32-byte seed encryption key from the environment, in strict base64. */
export function keyFromEnvironment(env: NodeJS.ProcessEnv): Buffer {
  const value = env[KEY_VARIABLE];
  const invalid = new SelectionKeyError(`${KEY_VARIABLE} must be base64 for exactly 32 bytes`);
  if (value === undefined || !BASE64_32_BYTES.test(value)) throw invalid;
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES || key.toString("base64") !== value) throw invalid;
  return key;
}
