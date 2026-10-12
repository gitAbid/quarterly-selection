import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SelectionKeyError } from "./errors";
import type { SelectionRunRecord } from "./types";
export interface EncryptedSeed {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
}
export function copyKey(value: unknown): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32)
    throw new SelectionKeyError("encryption key must be exactly 32 bytes");
  return Buffer.from(value);
}
const identity = (record: SelectionRunRecord) =>
  Buffer.from(
    JSON.stringify([record.algorithmVersion, record.companyId, record.quarter]),
    "utf8",
  );
export function encryptSeed(
  seed: string,
  key: Buffer,
  record: SelectionRunRecord,
): EncryptedSeed {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(identity(record));
  return {
    ciphertext: Buffer.concat([
      cipher.update(Buffer.from(seed, "hex")),
      cipher.final(),
    ]),
    nonce,
    tag: cipher.getAuthTag(),
  };
}
export function decryptSeed(
  encrypted: EncryptedSeed,
  key: Buffer,
  record: SelectionRunRecord,
): string {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, encrypted.nonce);
    decipher.setAAD(identity(record));
    decipher.setAuthTag(encrypted.tag);
    const bytes = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]);
    if (bytes.length !== 32) throw new Error("Invalid seed size");
    return bytes.toString("hex");
  } catch {
    throw new SelectionKeyError(
      "retained seed could not be authenticated; check key and stored evidence",
    );
  }
}
