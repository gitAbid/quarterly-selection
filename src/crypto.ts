import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SelectionKeyError } from "./errors";
import type { AlgorithmVersion } from "./types";

export interface EncryptedSeed {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly tag: Buffer;
}

/** The draw a seed belongs to. It is authenticated, so a seed can't be moved to another draw. */
export interface SeedBinding {
  readonly algorithmVersion: AlgorithmVersion;
  readonly companyId: string;
  readonly quarter: string;
}

/** Encrypts the retained seed at rest. The service depends on this, not on AES directly. */
export interface SeedCipher {
  encrypt(seedHex: string, binding: SeedBinding): EncryptedSeed;
  decrypt(encrypted: EncryptedSeed, binding: SeedBinding): string;
  /** Zeroes the key. The cipher can't be used afterwards. */
  dispose(): void;
}

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const SEED_BYTES = 32;
const ALGORITHM = "aes-256-gcm";

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
      throw new SelectionKeyError(
        "retained seed could not be authenticated; check key and stored evidence",
        { cause },
      );
    }
    if (seed.length !== SEED_BYTES)
      throw new SelectionKeyError(
        "retained seed could not be authenticated; check key and stored evidence",
      );
    return seed.toString("hex");
  }

  dispose(): void {
    this.key.fill(0);
  }
}

function associatedData(binding: SeedBinding): Buffer {
  return Buffer.from(
    JSON.stringify([binding.algorithmVersion, binding.companyId, binding.quarter]),
    "utf8",
  );
}
