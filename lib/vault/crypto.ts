/**
 * Vault envelope and key derivation. Byte-compatible with node:crypto
 * AES-256-GCM (same IV, tag, and ciphertext layout plus a version byte).
 *
 * Envelope: version:u8 || iv:12 || tag:16 || ciphertext
 */

import {
  concatBytes,
  timingSafeEqual,
  toArrayBuffer,
  utf8Bytes,
  utf8String,
} from "@/lib/vault/bytes";

export const VAULT_ENVELOPE_VERSION = 1;
export const VAULT_IV_LEN = 12;
export const VAULT_TAG_LEN = 16;
export const VAULT_ENVELOPE_OVERHEAD = 1 + VAULT_IV_LEN + VAULT_TAG_LEN;
export const VAULT_DEK_LEN = 32;
export const VAULT_SALT_LEN = 16;
export const VAULT_KDF = "pbkdf2-sha256";
export const VAULT_PBKDF2_ITERATIONS = 600_000;
export const VAULT_VERIFIER_PLAINTEXT = "blogide-vault-verifier-v1";
export const VAULT_DEDUPE_INFO = "blogide/conflict-dedupe/v1";
export const VAULT_NAME_PLACEHOLDER = "encrypted";

export type VaultKdfParams = {
  iterations: number;
};

function subtle(): SubtleCrypto {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error("WebCrypto is not available.");
  }
  return crypto.subtle;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function encodeEnvelope(
  iv: Uint8Array,
  tag: Uint8Array,
  ciphertext: Uint8Array,
  version = VAULT_ENVELOPE_VERSION
): Uint8Array {
  if (iv.byteLength !== VAULT_IV_LEN) throw new Error("IV must be 12 bytes.");
  if (tag.byteLength !== VAULT_TAG_LEN) throw new Error("Tag must be 16 bytes.");
  return concatBytes(Uint8Array.of(version), iv, tag, ciphertext);
}

export function decodeEnvelope(blob: Uint8Array): {
  version: number;
  iv: Uint8Array;
  tag: Uint8Array;
  ciphertext: Uint8Array;
} {
  if (blob.byteLength < VAULT_ENVELOPE_OVERHEAD + 1) {
    throw new Error("Ciphertext is truncated.");
  }
  const version = blob[0];
  if (version !== VAULT_ENVELOPE_VERSION) {
    throw new Error(`Unsupported vault envelope version ${version}.`);
  }
  return {
    version,
    iv: blob.subarray(1, 1 + VAULT_IV_LEN),
    tag: blob.subarray(1 + VAULT_IV_LEN, VAULT_ENVELOPE_OVERHEAD),
    ciphertext: blob.subarray(VAULT_ENVELOPE_OVERHEAD),
  };
}

export async function importAesKey(
  raw: Uint8Array,
  extractable: boolean
): Promise<CryptoKey> {
  return subtle().importKey(
    "raw",
    toArrayBuffer(raw),
    { name: "AES-GCM" },
    extractable,
    ["encrypt", "decrypt"]
  );
}

export async function generateDekBytes(): Promise<Uint8Array> {
  return randomBytes(VAULT_DEK_LEN);
}

export async function generateSalt(): Promise<Uint8Array> {
  return randomBytes(VAULT_SALT_LEN);
}

export async function deriveKek(
  secret: string,
  salt: Uint8Array,
  iterations = VAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const material = await subtle().importKey(
    "raw",
    toArrayBuffer(utf8Bytes(secret)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle().deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function deriveKekBits(
  secret: string,
  salt: Uint8Array,
  iterations = VAULT_PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  const material = await subtle().importKey(
    "raw",
    toArrayBuffer(utf8Bytes(secret)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await subtle().deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    material,
    256
  );
  return new Uint8Array(bits);
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  iv = randomBytes(VAULT_IV_LEN)
): Promise<Uint8Array> {
  const packed = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
      key,
      toArrayBuffer(plaintext)
    )
  );
  const ciphertext = packed.subarray(0, packed.byteLength - VAULT_TAG_LEN);
  const tag = packed.subarray(packed.byteLength - VAULT_TAG_LEN);
  return encodeEnvelope(iv, tag, ciphertext);
}

export async function decryptBytes(
  key: CryptoKey,
  envelope: Uint8Array
): Promise<Uint8Array> {
  const { iv, tag, ciphertext } = decodeEnvelope(envelope);
  const packed = concatBytes(ciphertext, tag);
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
    key,
    toArrayBuffer(packed)
  );
  return new Uint8Array(plain);
}

export async function encryptUtf8(
  key: CryptoKey,
  text: string
): Promise<Uint8Array> {
  return encryptBytes(key, utf8Bytes(text));
}

export async function decryptUtf8(
  key: CryptoKey,
  envelope: Uint8Array
): Promise<string> {
  return utf8String(await decryptBytes(key, envelope));
}

export async function wrapDek(
  kek: CryptoKey,
  dekBytes: Uint8Array
): Promise<Uint8Array> {
  return encryptBytes(kek, dekBytes);
}

export async function unwrapDek(
  kek: CryptoKey,
  wrapped: Uint8Array
): Promise<Uint8Array> {
  const raw = await decryptBytes(kek, wrapped);
  if (raw.byteLength !== VAULT_DEK_LEN) {
    throw new Error("Unwrapped key has the wrong length.");
  }
  return raw;
}

export async function importDekForUse(dekBytes: Uint8Array): Promise<CryptoKey> {
  return importAesKey(dekBytes, false);
}

export async function deriveDedupeKey(dekBytes: Uint8Array): Promise<CryptoKey> {
  const ikm = await subtle().importKey(
    "raw",
    toArrayBuffer(dekBytes),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: toArrayBuffer(utf8Bytes(VAULT_DEDUPE_INFO)),
    },
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"]
  );
}

export async function hmacSha256Hex(
  key: CryptoKey,
  message: string
): Promise<string> {
  const mac = await subtle().sign(
    "HMAC",
    key,
    toArrayBuffer(utf8Bytes(message))
  );
  return [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function encryptVerifier(dek: CryptoKey): Promise<Uint8Array> {
  return encryptUtf8(dek, VAULT_VERIFIER_PLAINTEXT);
}

export async function verifyDek(
  dek: CryptoKey,
  verifier: Uint8Array
): Promise<boolean> {
  try {
    const plain = utf8Bytes(await decryptUtf8(dek, verifier));
    return timingSafeEqual(plain, utf8Bytes(VAULT_VERIFIER_PLAINTEXT));
  } catch {
    return false;
  }
}

export function kdfParamsFromRow(value: unknown): VaultKdfParams {
  if (value && typeof value === "object" && "iterations" in value) {
    const iterations = Number((value as { iterations: unknown }).iterations);
    if (Number.isFinite(iterations) && iterations > 0) {
      return { iterations };
    }
  }
  return { iterations: VAULT_PBKDF2_ITERATIONS };
}

export function kdfNeedsUpgrade(
  kdf: string,
  params: VaultKdfParams
): boolean {
  if (kdf !== VAULT_KDF) return true;
  return params.iterations < VAULT_PBKDF2_ITERATIONS;
}
