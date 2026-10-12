/** 0 success · 1 invalid data or operational failure · 2 usage or unreadable JSON. */
export type ExitCode = 0 | 1 | 2;

export interface CommandResult {
  readonly output: unknown;
  readonly exitCode: ExitCode;
}

export type Command = (args: readonly string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>;
