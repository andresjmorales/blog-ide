import "server-only";
import {
  decryptSecretPayload,
  encryptSecretPayload,
} from "@/lib/secrets/crypto";
import type { AccountSecrets } from "@/lib/secrets/types";

export function secretsKeyMaterial(): string {
  const explicit = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (explicit) return explicit;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fallback) return fallback;
  throw new Error(
    "Set SECRETS_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) to store account secrets."
  );
}

export function encodeSecrets(payload: AccountSecrets): string {
  return encryptSecretPayload(payload, secretsKeyMaterial());
}

export function decodeSecrets(blob: string): AccountSecrets {
  return decryptSecretPayload(blob, secretsKeyMaterial());
}
