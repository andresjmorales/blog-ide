import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ShellChat } from "@/components/shell/ShellChat";
import type { WorkspaceNode } from "@/lib/workspace/types";

vi.mock("@/lib/sync/engine", () => ({
  openDocument: vi.fn(async (nodeId: string) => ({
    nodeId,
    markdown: "",
    baseVersion: 1,
    dirty: false,
  })),
}));

vi.mock("@/lib/capture/appendQuickNote", () => ({
  appendQuickNote: vi.fn(async () => {}),
}));

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

function fixtureNodes(): WorkspaceNode[] {
  const inbox = node({
    id: "inbox",
    kind: "folder",
    name: "Notes",
    system_key: "inbox",
  });
  const vegan = node({
    id: "ch-vegan",
    kind: "document",
    name: "vegan.md",
    parent_id: inbox.id,
    position: 0,
  });
  const general = node({
    id: "ch-general",
    kind: "document",
    name: "general.md",
    parent_id: inbox.id,
    position: 1,
  });
  const essay = node({
    id: "doc-essay",
    kind: "document",
    name: "essay.md",
  });
  return [inbox, vegan, general, essay];
}

describe("ShellChat composer", () => {
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

  function render(withManager = false) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const extra = withManager
      ? {
          onNewChannel: () => {},
          onOpenChannelDoc: () => {},
          onRenameChannel: () => {},
          onTrashChannel: () => {},
        }
      : {};
    act(() => {
      root!.render(<ShellChat nodes={fixtureNodes()} {...extra} />);
    });
  }

  it("gives the note field the full row and keeps channel plus append on a second row", () => {
    render();
    expect(host!.querySelector("select")).toBeNull();
    expect(host!.textContent).not.toContain("enter");
    expect(host!.textContent).not.toContain("Also append to…");

    const textarea = host!.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Note"]'
    );
    expect(textarea).toBeTruthy();
    expect(textarea!.placeholder).toBe("note to self…");

    const channel = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Channel"]'
    );
    expect(channel).toBeTruthy();
    expect(channel!.className).toContain("font-sans");
    expect(channel!.querySelector("[data-select-caret]")).toBeTruthy();

    const filter = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Viewing channel"]'
    );
    expect(filter).toBeTruthy();
    expect(filter!.className).toContain("font-sans");

    const append = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Append"]'
    );
    expect(append).toBeTruthy();
    expect(append!.textContent).toBe("Append");
    expect(append!.parentElement?.className).toContain("ml-auto");
    expect(
      host!.querySelector('button[aria-label="Append to document"]')
    ).toBeNull();
  });

  it("pins refresh to the right of the header, beside the manager", () => {
    render(true);
    const refresh = [...host!.querySelectorAll("button")].find(
      (btn) => btn.textContent === "refresh"
    );
    expect(refresh).toBeTruthy();
    expect(refresh!.parentElement?.className).toContain("ml-auto");
    expect(
      host!.querySelector('button[aria-label="Notes manager"]')
    ).toBeTruthy();
    expect(refresh!.parentElement?.contains(
      host!.querySelector('button[aria-label="Notes manager"]')
    )).toBe(true);
  });

  it("toggles the append dropdown from Append and clears it with ×", () => {
    render();
    const toggle = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Append"]'
    )!;

    act(() => {
      toggle.click();
    });
    const picker = host!.querySelector<HTMLButtonElement>(
      'button[aria-label="Append to document"]'
    );
    expect(picker).toBeTruthy();
    expect(picker!.textContent).toContain("Append to…");
    expect(picker!.querySelector("[data-select-caret]")).toBeTruthy();
    expect(
      host!.querySelector('button[aria-label="Cancel append to document"]')
    ).toBeTruthy();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      toggle.click();
    });
    expect(
      host!.querySelector('button[aria-label="Append to document"]')
    ).toBeNull();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      toggle.click();
    });
    act(() => {
      host!
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Cancel append to document"]'
        )!
        .click();
    });
    expect(
      host!.querySelector('button[aria-label="Append to document"]')
    ).toBeNull();
  });

  it("opens channel options in the app sans font instead of a native select", () => {
    render();
    act(() => {
      host!.querySelector<HTMLButtonElement>('button[aria-label="Channel"]')!.click();
    });
    const list = host!.querySelector('[role="listbox"]');
    expect(list).toBeTruthy();
    expect(list!.className).toContain("font-sans");
    expect(list!.textContent).toContain("vegan");
    expect(list!.textContent).toContain("All channels");
  });

  it("uses the app sans font for the Notes manager menu", () => {
    render(true);
    act(() => {
      host!
        .querySelector<HTMLButtonElement>('button[aria-label="Notes manager"]')!
        .click();
    });
    const menu = host!.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    expect(menu!.className).toContain("font-sans");
    expect(menu!.textContent).toContain("New channel");
  });
});
