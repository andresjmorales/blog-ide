import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EXPLORER_FOLD,
  loadExplorerFold,
  pruneCollapsedIds,
  saveExplorerFold,
} from "@/lib/workspace/explorerFold";

describe("explorer fold cache", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips collapsed folders keyed by email", () => {
    saveExplorerFold("Ada@example.com", {
      collapsedIds: ["folder-1", "folder-2"],
      trashOpen: false,
      vaultOpen: true,
    });
    expect(loadExplorerFold("ada@example.com")).toEqual({
      collapsedIds: ["folder-1", "folder-2"],
      trashOpen: false,
      vaultOpen: true,
    });
    expect(loadExplorerFold("other@example.com")).toEqual(DEFAULT_EXPLORER_FOLD);
  });

  it("rejects a corrupted payload", () => {
    localStorage.setItem(
      "blogide.explorerFold.v1:ada@example.com",
      JSON.stringify({ v: 1, collapsedIds: [1, "ok"] })
    );
    expect(loadExplorerFold("ada@example.com").collapsedIds).toEqual(["ok"]);
  });

  it("drops collapsed ids that are no longer folders", () => {
    expect(pruneCollapsedIds(["keep", "gone"], ["keep", "other"])).toEqual([
      "keep",
    ]);
  });
});
