import { describe, expect, it } from "vitest";
import {
  classifyVaultDrift,
  repairForDrift,
} from "@/lib/vault/reconcile";
import {
  crossesVaultBoundary,
  isInVault,
} from "@/lib/vault/membership";
import type { WorkspaceNode } from "@/lib/workspace/types";

function node(partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id">): WorkspaceNode {
  return {
    user_id: "u",
    parent_id: null,
    kind: "folder",
    name: "n",
    position: 0,
    url: null,
    pinned: false,
    system_key: null,
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("classifyVaultDrift", () => {
  it("encrypts plaintext that landed in the vault", () => {
    expect(
      classifyVaultDrift({ inVault: true, inTrash: false, enc: 0 })
    ).toBe("plaintext_in_vault");
    expect(repairForDrift("plaintext_in_vault")).toBe("encrypt_now");
  });

  it("finishes an interrupted move-in and leaves trash ciphertext", () => {
    expect(
      classifyVaultDrift({ inVault: false, inTrash: false, enc: 1 })
    ).toBe("move_in_interrupted");
    expect(repairForDrift("move_in_interrupted")).toBe("finish_move_in");
    expect(
      classifyVaultDrift({ inVault: false, inTrash: true, enc: 1 })
    ).toBe("encrypted_in_trash");
    expect(repairForDrift("encrypted_in_trash")).toBe("none");
  });
});

describe("vault membership", () => {
  it("walks ancestry and detects boundary crosses", () => {
    const vault = node({ id: "v", system_key: "vault", name: "Vault" });
    const inner = node({ id: "i", parent_id: "v", name: "secret" });
    const doc = node({
      id: "d",
      parent_id: "i",
      kind: "document",
      name: "a.md",
    });
    const outside = node({ id: "o", kind: "document", name: "b.md" });
    const nodes = [vault, inner, doc, outside];
    expect(isInVault("d", nodes)).toBe(true);
    expect(isInVault("v", nodes)).toBe(true);
    expect(isInVault("o", nodes)).toBe(false);
    expect(crossesVaultBoundary("d", null, nodes)).toBe(true);
    expect(crossesVaultBoundary("o", "v", nodes)).toBe(true);
    expect(crossesVaultBoundary("d", "i", nodes)).toBe(false);
  });
});
