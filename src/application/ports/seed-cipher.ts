import type { AlgorithmVersion } from "../../domain/model";

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

/** Encrypts the retained seed at rest. The service depends on this port, not on AES. */
export interface SeedCipher {
  encrypt(seedHex: string, binding: SeedBinding): EncryptedSeed;

  decrypt(encrypted: EncryptedSeed, binding: SeedBinding): string;

  /** Zeroes the key. The cipher can't be used afterwards. */
  dispose(): void;
}
