export class SelectionInputError extends Error {
  override name = "SelectionInputError";
}
export class SelectionStorageError extends Error {
  override name = "SelectionStorageError";
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}
export class SelectionKeyError extends Error {
  override name = "SelectionKeyError";
}
export class SelectionNotFoundError extends Error {
  override name = "SelectionNotFoundError";
}
