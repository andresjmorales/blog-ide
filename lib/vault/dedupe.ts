import { hmacSha256Hex } from "@/lib/vault/crypto";

/**
 * Deterministic conflict idempotency key. HMAC over plaintext so a retried
 * save with a fresh IV still dedupes, and the server never sees a guessable
 * hash of the document.
 */
export async function vaultConflictKey(
  hmacKey: CryptoKey,
  originId: string,
  baseVersion: number,
  plaintext: string
): Promise<string> {
  return hmacSha256Hex(hmacKey, `${originId}${baseVersion}${plaintext}`);
}
