import { SelectionError } from "../domain/errors";
import type { ExitCode } from "./types";

interface Failure {
  readonly message: string;
  readonly exitCode: ExitCode;
}

export const USAGE =
  "usage: cli draw --db FILE --input JSON | get|audit --db FILE --company ID --quarter YYYY-Qn | verify BUNDLE";

const UNEXPECTED_FAILURE = "selection operation failed";

/** Bad arguments or an unreadable file: exit code 2. */
export class UsageError extends Error {
  override readonly name = "UsageError";
}

/** Only messages from our own errors are shown; anything unexpected stays generic. */
export function describeFailure(error: unknown): Failure {
  if (error instanceof UsageError) return { message: error.message, exitCode: 2 };
  if (error instanceof SelectionError) return { message: error.message, exitCode: 1 };
  return { message: UNEXPECTED_FAILURE, exitCode: 1 };
}
