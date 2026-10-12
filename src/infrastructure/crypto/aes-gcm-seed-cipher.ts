import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type {
  EncryptedSeed,
  SeedBinding,
  SeedCipher,
} from "../../application/ports";
import { SelectionKeyError } from "../../domain/errors";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const SEED_BYTES = 32;
const AUTHENTICATION_FAILED =
  "retained seed could not be authenticated; check key and stored evidence";

/** AES-256-GCM with a fresh nonce per seed and the draw identity as associated data. */
export class AesGcmSeedCipher implements SeedCipher {
  private readonly key: Buffer;

  /** Copies the key, so the caller can zero their own buffer straight away. */
  constructor(key: unknown) {
    if (!(key instanceof Uint8Array) || key.byteLength !== KEY_BYTES)
      throw new SelectionKeyError("encryption key must be exactly 32 bytes");
    this.key = Buffer.from(key);
  }

  encrypt(seedHex: string, binding: SeedBinding): EncryptedSeed {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, nonce);
    cipher.setAAD(associatedData(binding));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(seedHex, "hex")),
      cipher.final(),
    ]);
    return { ciphertext, nonce, tag: cipher.getAuthTag() };
  }

  decrypt(encrypted: EncryptedSeed, binding: SeedBinding): string {
    let seed: Buffer;
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, encrypted.nonce);
      decipher.setAAD(associatedData(binding));
      decipher.setAuthTag(encrypted.tag);
      seed = Buffer.concat([
        decipher.update(encrypted.ciphertext),
        decipher.final(),
      ]);
    } catch (cause) {
      throw new SelectionKeyError(AUTHENTICATION_FAILED, { cause });
    }
    if (seed.length !== SEED_BYTES)
      throw new SelectionKeyError(AUTHENTICATION_FAILED);
    return seed.toString("hex");
  }

  dispose(): void {
    this.key.fill(0);
  }
}

function associatedData(binding: SeedBinding): Buffer {
  return Buffer.from(
    JSON.stringify([
      binding.algorithmVersion,
      binding.companyId,
      binding.quarter,
    ]),
    "utf8",
  );
}
