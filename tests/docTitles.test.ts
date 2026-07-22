import { describe, expect, it } from "vitest";
import {
  titleCandidateNodes,
  titleFromMarkdown,
} from "@/lib/workspace/docTitles";
import type { WorkspaceNode } from "@/lib/workspace/types";

let seq = 0;
function node(partial: Partial<WorkspaceNode>): WorkspaceNode {
  seq += 1;
  return {
    id: `id-${seq}`,
    user_id: "u",
    parent_id: null,
    kind: "document",
    name: `doc-${seq}.md`,
    position: seq,
    url: null,
    pinned: false,
    system_key: null,
    color: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("titleFromMarkdown", () => {
  it("reads a frontmatter title", () => {
    expect(
      titleFromMarkdown("---\ntitle: Hello World\n---\n\nBody\n")
    ).toBe("Hello World");
  });

  it("returns null when title is absent", () => {
    expect(titleFromMarkdown("# Just a heading\n")).toBeNull();
  });
});

describe("titleCandidateNodes", () => {
  it("skips Notes channels and Trash documents", () => {
    const essays = node({ kind: "folder", name: "essays" });
    const essay = node({ name: "essay.md", parent_id: essays.id });
    const inbox = node({ kind: "folder", name: "Notes", system_key: "inbox" });
    const channel = node({ name: "general.md", parent_id: inbox.id });
    const trash = node({ kind: "folder", name: "Trash", system_key: "trash" });
    const trashed = node({ name: "gone.md", parent_id: trash.id });
    const ids = titleCandidateNodes([
      essays,
      essay,
      inbox,
      channel,
      trash,
      trashed,
    ]).map((n) => n.id);
    expect(ids).toEqual([essay.id]);
  });
});
