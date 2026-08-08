import { describe, expect, it } from "vitest";
import {
  classifyConflict,
  parseLegacyConflictTimestamp,
} from "@/lib/workspace/conflicts";
import type { WorkspaceNode } from "@/lib/workspace/types";

function node(patch: Partial<WorkspaceNode>): WorkspaceNode {
  return {
    id: "copy",
    user_id: "user",
    parent_id: null,
    kind: "document",
    name: "essay.md",
    position: 0,
    url: null,
    pinned: false,
    system_key: null,
    color: null,
    created_at: "2026-08-08T20:00:00.000Z",
    updated_at: "2026-08-08T20:00:00.000Z",
    ...patch,
  };
}

describe("workspace conflict presentation", () => {
  it("classifies unresolved metadata conflicts as resolvable", () => {
    expect(
      classifyConflict(
        node({
          conflict_of: "origin",
          conflict_created_at: "2026-08-08T21:55:22.000Z",
        })
      )
    ).toMatchObject({
      badge: "Conflict",
      originId: "origin",
      unresolved: true,
      resolvable: true,
      legacy: false,
    });
  });

  it("labels resolved keep-both copies as local copies", () => {
    expect(
      classifyConflict(
        node({
          conflict_of: "origin",
          conflict_resolution: "keep_both",
          conflict_resolved_at: "2026-08-08T22:00:00.000Z",
        })
      )
    ).toMatchObject({
      badge: "Local copy",
      unresolved: false,
      resolvable: false,
    });
  });

  it("does not revive a resolved Trash copy from its legacy filename", () => {
    expect(
      classifyConflict(
        node({
          name: "Essay (conflict 2026-08-08-21-55-22).md",
          conflict_of: "origin",
          conflict_resolution: "keep_cloud",
          conflict_resolved_at: "2026-08-08T22:00:00.000Z",
        })
      )
    ).toBeNull();
  });

  it("recognizes valid legacy UTC timestamp filenames without an origin", () => {
    const legacy = classifyConflict(
      node({ name: "Essay (conflict 2026-08-08-21-55-22).md" })
    );
    expect(legacy).toMatchObject({
      badge: "Conflict",
      originId: null,
      unresolved: true,
      resolvable: false,
      legacy: true,
      createdAt: "2026-08-08T21:55:22.000Z",
    });
    expect(
      parseLegacyConflictTimestamp(
        "Essay (conflict 2026-02-31-21-55-22).md"
      )
    ).toBeNull();
  });
});
