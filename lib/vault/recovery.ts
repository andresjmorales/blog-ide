import { bytesToBase64, base64ToBytes } from "@/lib/vault/bytes";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const RECOVERY_CODE_BYTES = 32;

/** RFC 4648 base32 without padding. */
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function decodeBase32(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (!clean) throw new Error("Recovery code is empty.");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Recovery code is invalid.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateRecoveryCode(): { code: string; raw: Uint8Array } {
  const raw = new Uint8Array(RECOVERY_CODE_BYTES);
  globalThis.crypto.getRandomValues(raw);
  return { code: formatRecoveryCode(encodeBase32(raw)), raw };
}

/** Groups as XXXX-XXXX-… for display and paper backup. */
export function formatRecoveryCode(code: string): string {
  const compact = code.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const parts: string[] = [];
  for (let i = 0; i < compact.length; i += 4) {
    parts.push(compact.slice(i, i + 4));
  }
  return parts.join("-");
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function recoverySecretFromCode(code: string): string {
  const raw = decodeBase32(code);
  if (raw.byteLength < RECOVERY_CODE_BYTES) {
    throw new Error("Recovery code is truncated.");
  }
  return bytesToBase64(raw.subarray(0, RECOVERY_CODE_BYTES));
}

export function recoverySecretFromRaw(raw: Uint8Array): string {
  return bytesToBase64(raw);
}

export function recoveryRawFromSecret(secret: string): Uint8Array {
  return base64ToBytes(secret);
}

/** One grouped block used for the "confirm you stored it" retype. */
export function recoveryConfirmSegment(code: string, index = 2): string {
  const parts = formatRecoveryCode(code).split("-");
  const pick = parts[Math.min(index, parts.length - 1)] ?? parts[0] ?? "";
  return pick;
}
