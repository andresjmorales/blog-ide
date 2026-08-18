import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { FileExplorer } from "@/components/FileExplorer";
import type { WorkspaceNode } from "@/lib/workspace/types";

function node(partial: Partial<WorkspaceNode> & Pick<WorkspaceNode, "id" | "kind" | "name">): WorkspaceNode {
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

describe("FileExplorer GitHub submenu", () => {
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

  function render() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const essay = node({ id: "doc-1", kind: "document", name: "essay.md" });
    act(() => {
      root!.render(
        <FileExplorer
          nodes={[essay]}
          activeNodeId={essay.id}
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
          onMapToGithub={vi.fn()}
          onPushToGithub={vi.fn()}
          onPullFromGithub={vi.fn()}
        />
      );
    });
  }

  it("nests Map, Pull, and Push under GitHub in the row kebab", () => {
    render();
    act(() => {
      host!
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Options for essay.md"]'
        )!
        .click();
    });
    const menu = document.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    const github = [...menu!.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("GitHub")
    );
    expect(github).toBeTruthy();
    expect(menu!.textContent).not.toContain("Map to GitHub");
    act(() => {
      (github as HTMLButtonElement).click();
    });
    const labels = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
      .map((item) => item.textContent?.replace("›", "").trim())
      .filter(Boolean);
    expect(labels).toContain("Map to GitHub…");
    expect(labels).toContain("Pull from GitHub…");
    expect(labels).toContain("Push to GitHub");
    const pull = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === "Pull from GitHub…"
    ) as HTMLButtonElement;
    expect(pull.disabled).toBe(true);
  });
});
