export type SelectionErrorCode =
  "INVALID_INPUT" | "STORAGE" | "KEY" | "NOT_FOUND";

/**
 * Base class for every error this package raises on purpose. Messages are safe
 * to show to users: they never contain seeds, keys or raw database errors.
 * The underlying error, if any, is kept in `cause` for debugging.
 */
export abstract class SelectionError extends Error {
  abstract readonly code: SelectionErrorCode;
}

export class SelectionInputError extends SelectionError {
  override readonly name = "SelectionInputError";
  readonly code = "INVALID_INPUT";
}

export class SelectionStorageError extends SelectionError {
  override readonly name = "SelectionStorageError";
  readonly code = "STORAGE";

  constructor(
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class SelectionKeyError extends SelectionError {
  override readonly name = "SelectionKeyError";
  readonly code = "KEY";
}

export class SelectionNotFoundError extends SelectionError {
  override readonly name = "SelectionNotFoundError";
  readonly code = "NOT_FOUND";
}
