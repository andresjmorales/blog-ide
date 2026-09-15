import { byteaToBytes } from "@/lib/vault/bytes";
import { decryptUtf8 } from "@/lib/vault/crypto";
import { getVaultKeys, VaultLockedError } from "@/lib/vault/session";
import type { RemoteDocument } from "@/lib/workspace/types";

export async function plaintextFromRemote(
  remote: RemoteDocument
): Promise<string> {
  if (remote.enc !== 1) return remote.markdown;
  const keys = getVaultKeys();
  if (!keys) throw new VaultLockedError();
  const blob = byteaToBytes(remote.ciphertext);
  if (!blob) throw new Error("Missing ciphertext.");
  return decryptUtf8(keys.dek, blob);
}

export async function plaintextFromConflictPayload(input: {
  remoteMarkdown?: string;
  remoteEnc?: number;
  remoteCiphertext?: string | null;
}): Promise<string | null> {
  if (input.remoteEnc === 1) {
    const keys = getVaultKeys();
    if (!keys) throw new VaultLockedError();
    const blob = byteaToBytes(input.remoteCiphertext);
    if (!blob) return null;
    return decryptUtf8(keys.dek, blob);
  }
  return input.remoteMarkdown ?? null;
}
