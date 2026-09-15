import { createClient } from "@/lib/supabase/client";
import { byteaToBytes, bytesToByteaParam } from "@/lib/vault/bytes";
import { VAULT_KDF, type VaultKdfParams } from "@/lib/vault/crypto";
import { requestTimeoutSignal, SYNC_WRITE_TIMEOUT_MS } from "@/lib/net/timeout";
import {
  isRetryableVaultRpcError,
  parseCreateVaultResult,
  type CreateVaultResult,
} from "@/lib/vault/rpcResult";

export type { CreateVaultResult };

export type UserVaultRow = {
  user_id: string;
  node_id: string;
  dek_wrapped_pass: Uint8Array;
  kdf: string;
  kdf_params: VaultKdfParams;
  salt_pass: Uint8Array;
  dek_wrapped_recovery: Uint8Array;
  salt_recovery: Uint8Array;
  verifier: Uint8Array;
  created_at: string;
  updated_at: string;
};

export type UpdateVaultWrapsInput = {
  dekWrappedPass: Uint8Array;
  saltPass: Uint8Array;
  dekWrappedRecovery?: Uint8Array;
  saltRecovery?: Uint8Array;
  kdf?: string;
  kdfParams?: VaultKdfParams;
  verifier?: Uint8Array;
};

function client() {
  return createClient();
}

function parseVaultRow(row: Record<string, unknown>): UserVaultRow | null {
  const dekWrappedPass = byteaToBytes(row.dek_wrapped_pass);
  const saltPass = byteaToBytes(row.salt_pass);
  const dekWrappedRecovery = byteaToBytes(row.dek_wrapped_recovery);
  const saltRecovery = byteaToBytes(row.salt_recovery);
  const verifier = byteaToBytes(row.verifier);
  if (
    typeof row.user_id !== "string" ||
    typeof row.node_id !== "string" ||
    !dekWrappedPass ||
    !saltPass ||
    !dekWrappedRecovery ||
    !saltRecovery ||
    !verifier
  ) {
    return null;
  }
  const params = (row.kdf_params ?? { iterations: 600000 }) as VaultKdfParams;
  return {
    user_id: row.user_id,
    node_id: row.node_id,
    dek_wrapped_pass: dekWrappedPass,
    kdf: typeof row.kdf === "string" ? row.kdf : VAULT_KDF,
    kdf_params: params,
    salt_pass: saltPass,
    dek_wrapped_recovery: dekWrappedRecovery,
    salt_recovery: saltRecovery,
    verifier,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function fetchUserVault(): Promise<UserVaultRow | null> {
  const { data, error } = await client()
    .from("user_vault")
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "PGRST116" || error.code === "42P01") return null;
    throw error;
  }
  if (!data) return null;
  return parseVaultRow(data as Record<string, unknown>);
}

export async function createVaultRemote(input: {
  dekWrappedPass: Uint8Array;
  saltPass: Uint8Array;
  dekWrappedRecovery: Uint8Array;
  saltRecovery: Uint8Array;
  verifier: Uint8Array;
  kdf?: string;
  kdfParams?: VaultKdfParams;
}): Promise<CreateVaultResult> {
  const payload = {
    p_dek_wrapped_pass: bytesToByteaParam(input.dekWrappedPass),
    p_salt_pass: bytesToByteaParam(input.saltPass),
    p_dek_wrapped_recovery: bytesToByteaParam(input.dekWrappedRecovery),
    p_salt_recovery: bytesToByteaParam(input.saltRecovery),
    p_verifier: bytesToByteaParam(input.verifier),
    p_kdf: input.kdf ?? VAULT_KDF,
    p_kdf_params: input.kdfParams ?? { iterations: 600000 },
  };
  let { data, error } = await client().rpc("create_vault", payload);
  if (error && isRetryableVaultRpcError(error)) {
    ({ data, error } = await client().rpc("create_vault", payload));
  }
  if (error) throw error;
  return parseCreateVaultResult(data);
}

export async function updateVaultWraps(
  input: UpdateVaultWrapsInput
): Promise<void> {
  const { error } = await client().rpc("update_vault_wraps", {
    p_dek_wrapped_pass: bytesToByteaParam(input.dekWrappedPass),
    p_salt_pass: bytesToByteaParam(input.saltPass),
    p_dek_wrapped_recovery: input.dekWrappedRecovery
      ? bytesToByteaParam(input.dekWrappedRecovery)
      : null,
    p_salt_recovery: input.saltRecovery
      ? bytesToByteaParam(input.saltRecovery)
      : null,
    p_kdf: input.kdf ?? null,
    p_kdf_params: input.kdfParams ?? null,
    p_verifier: input.verifier ? bytesToByteaParam(input.verifier) : null,
  });
  if (error) throw error;
}

export async function purgeDocumentRevisions(nodeId: string): Promise<void> {
  const { error } = await client()
    .rpc("purge_document_revisions", { p_node_id: nodeId })
    .abortSignal(requestTimeoutSignal(SYNC_WRITE_TIMEOUT_MS));
  if (error) throw error;
}

export async function setWorkspaceNodeEnc(input: {
  nodeId: string;
  name: string;
  nameEnc: Uint8Array | null;
  url?: string | null;
  urlEnc?: Uint8Array | null;
}): Promise<void> {
  const { error } = await client().rpc("set_workspace_node_enc", {
    p_node_id: input.nodeId,
    p_name: input.name,
    p_name_enc: input.nameEnc ? bytesToByteaParam(input.nameEnc) : null,
    p_url: input.url ?? null,
    p_url_enc: input.urlEnc ? bytesToByteaParam(input.urlEnc) : null,
  });
  if (error) throw error;
}

export async function deleteVaultRemote(): Promise<void> {
  const { error } = await client().rpc("delete_vault");
  if (error) throw error;
}
