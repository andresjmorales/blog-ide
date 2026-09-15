import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { FileExplorer } from "@/components/FileExplorer";
import type { WorkspaceNode } from "@/lib/workspace/types";

function node(
  partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind" | "name">
): WorkspaceNode {
  return {
    user_id: "u",
    parent_id: null,
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

const noop = () => {};

describe("FileExplorer vault overlay labels", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
  });

  function vaultTree() {
    const vault = node({
      id: "vault",
      kind: "folder",
      name: "Vault",
      system_key: "vault",
    });
    const folder = node({
      id: "folder",
      kind: "folder",
      name: "encrypted",
      parent_id: vault.id,
    });
    const secretDoc = node({
      id: "secret-doc",
      kind: "document",
      name: "encrypted",
      parent_id: folder.id,
    });
    const other = node({
      id: "other",
      kind: "document",
      name: "encrypted",
      parent_id: vault.id,
    });
    return { vault, folder, secretDoc, other };
  }

  function render(extra?: {
    vaultNames?: Map<string, string>;
    collideNames?: boolean;
  }) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const tree = vaultTree();
    const vaultNames =
      extra?.vaultNames ??
      new Map([
        [tree.folder.id, "Secret Folder"],
        [tree.secretDoc.id, extra?.collideNames ? "Other.md" : "Secret Doc.md"],
        [tree.other.id, "Other.md"],
      ]);
    act(() => {
      root!.render(
        <FileExplorer
          nodes={[tree.vault, tree.folder, tree.secretDoc, tree.other]}
          activeNodeId={tree.other.id}
          vaultUnlocked
          vaultNames={vaultNames}
          onOpen={noop}
          onNewDocument={noop}
          onPopOutDocument={noop}
          onNewFolder={noop}
          onMoveToTrash={noop}
          onRestore={noop}
          onMoveTo={noop}
          onRename={noop}
          onTogglePin={noop}
          onSetColor={noop}
          onDeleteForever={noop}
          onMoveToVault={vi.fn()}
          onMoveOutOfVault={vi.fn()}
        />
      );
    });
    return tree;
  }

  it("does not flag distinct unlocked vault essays as the same filename", () => {
    render();
    expect(host!.querySelector(".explorer-same-name-chip")).toBeNull();
    expect(host!.textContent).toContain("Secret Folder");
    expect(host!.textContent).toContain("Other");
  });

  it("labels Move to… with the decrypted vault folder name", () => {
    render();
    act(() => {
      host!
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Options for Other.md"]'
        )!
        .click();
    });
    const move = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("Move to")
    ) as HTMLButtonElement;
    expect(move).toBeTruthy();
    act(() => {
      move.click();
    });
    const labels = [
      ...document.querySelectorAll('[role="menu"] [role="menuitem"]'),
    ].map((item) => item.textContent?.replace("›", "").trim());
    expect(labels).toContain("Vault/Secret Folder");
    expect(labels).not.toContain("Vault/encrypted");
  });

  it("shows a same-name chip only when decrypted filenames actually match", () => {
    render({ collideNames: true });
    const chip = host!.querySelector(".explorer-same-name-chip");
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toMatch(/also Vault\/Secret Folder/i);
    expect(chip!.textContent).not.toMatch(/encrypted/i);
  });
});
