// Domain: model, errors and the pure algorithm.
export * from "./domain/model";
export * from "./domain/errors";
export { replaySelection } from "./domain/selection";
export { verifyAuditBundle } from "./domain/audit-verification";

// Application: use cases and the ports adapters implement.
export type { RunOutcome, SelectionService } from "./application/selection-service";
export { DefaultSelectionService, type SelectionServiceDependencies } from "./application/default-selection-service";
export type {
  EncryptedSeed,
  InsertResult,
  SeedBinding,
  SeedCipher,
  SelectionStore,
  StoredRun,
} from "./application/ports";

// Infrastructure: default adapters.
export { SqliteSelectionStore } from "./infrastructure/persistence/sqlite-selection-store";
export { AesGcmSeedCipher } from "./infrastructure/crypto/aes-gcm-seed-cipher";

// Bootstrap: factory that wires the defaults together.
export { openSelectionService, type ServiceOptions } from "./bootstrap/open-selection-service";
