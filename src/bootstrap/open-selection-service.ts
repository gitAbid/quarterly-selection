import { DefaultSelectionService } from "../application/default-selection-service";
import type { SelectionStore } from "../application/ports";
import type { SelectionService } from "../application/selection-service";
import { AesGcmSeedCipher } from "../infrastructure/crypto/aes-gcm-seed-cipher";
import { SqliteSelectionStore } from "../infrastructure/persistence/sqlite-selection-store";

export interface ServiceOptions {
  databasePath: string;
  encryptionKey: Uint8Array;
  now?: () => Date;
}

/**
 * Composition root (factory): the only place that knows which adapters are
 * used. The key is checked before any file is created, and the key copy is
 * zeroed again if the database can't be opened.
 */
export function openSelectionService(
  options: ServiceOptions,
): SelectionService {
  const cipher = new AesGcmSeedCipher(options.encryptionKey);
  let store: SelectionStore;
  try {
    store = new SqliteSelectionStore(options.databasePath);
  } catch (error) {
    cipher.dispose();
    throw error;
  }
  return new DefaultSelectionService({
    store,
    cipher,
    ...(options.now ? { clock: options.now } : {}),
  });
}
