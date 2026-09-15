export type VaultDriftKind =
  | "ok"
  | "move_in_interrupted"
  | "plaintext_in_vault"
  | "encrypted_in_trash"
  | "plaintext_in_trash";

export type VaultDrift = {
  nodeId: string;
  kind: VaultDriftKind;
};

export function classifyVaultDrift(input: {
  inVault: boolean;
  inTrash: boolean;
  enc: number;
}): VaultDriftKind {
  const enc = input.enc === 1 ? 1 : 0;
  if (input.inTrash) {
    return enc === 1 ? "encrypted_in_trash" : "plaintext_in_trash";
  }
  if (input.inVault && enc === 1) return "ok";
  if (!input.inVault && enc === 0) return "ok";
  if (!input.inVault && enc === 1) return "move_in_interrupted";
  return "plaintext_in_vault";
}

export function repairForDrift(
  kind: VaultDriftKind
): "none" | "finish_move_in" | "encrypt_now" {
  if (kind === "plaintext_in_vault") return "encrypt_now";
  if (kind === "move_in_interrupted") return "finish_move_in";
  return "none";
}
