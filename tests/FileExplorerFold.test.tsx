import { afterEach, describe, expect, it } from "vitest";
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

describe("FileExplorer fold persistence", () => {
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
    localStorage.clear();
  });

  function tree() {
    const essays = node({ id: "essays", kind: "folder", name: "essays" });
    const nested = node({
      id: "series",
      kind: "folder",
      name: "series",
      parent_id: essays.id,
    });
    const doc = node({
      id: "doc-1",
      kind: "document",
      name: "one.md",
      parent_id: nested.id,
    });
    return [essays, nested, doc];
  }

  function render(nodes: WorkspaceNode[]) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <FileExplorer
          nodes={nodes}
          activeNodeId="doc-1"
          accountEmail="ada@example.com"
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
        />
      );
    });
  }

  it("remembers a collapsed folder after remount", () => {
    const nodes = tree();
    render(nodes);
    const toggle = host!.querySelector<HTMLButtonElement>(
      'button[aria-expanded="true"][title="Collapse essays"]'
    );
    expect(toggle).toBeTruthy();
    act(() => {
      toggle!.click();
    });
    expect(
      host!.querySelector('button[aria-expanded="false"][title="Expand essays"]')
    ).toBeTruthy();

    act(() => {
      root!.unmount();
    });
    root = null;
    host!.remove();
    host = null;

    render(nodes);
    expect(
      host!.querySelector('button[aria-expanded="false"][title="Expand essays"]')
    ).toBeTruthy();
    expect(
      host!.querySelector('button[aria-expanded="true"][title="Collapse essays"]')
    ).toBeNull();
  });
});
