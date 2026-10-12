import { algorithmFor } from "../domain/algorithms/registry";
import { verifyAuditBundle } from "../domain/audit-verification";
import { SelectionStorageError } from "../domain/errors";
import type { AuditBundle } from "../domain/model";
import type { SeedCipher, StoredRun } from "./ports";

/**
 * Decrypts a stored run's seed and checks the run replays exactly before
 * anything is returned. Used on every read, so corrupt or tampered storage
 * fails loudly instead of being served.
 */
export function openAuditBundle(stored: StoredRun, cipher: SeedCipher): AuditBundle {
  const bundle: AuditBundle = {
    record: stored.record,
    revealedSeed: cipher.decrypt(stored.encrypted, stored.record),
    algorithm: algorithmFor(stored.record.algorithmVersion).description,
  };
  if (!verifyAuditBundle(bundle).ok) throw new SelectionStorageError("persisted selection evidence is inconsistent");
  return bundle;
}
