import { describe, expect, it } from "vitest";
import {
  closePanel,
  DEFAULT_PANEL_LAYOUT,
  movePanel,
  panelLayoutFromLegacy,
  popInPanel,
  popOutPanel,
  showPanel,
  visibleTabs,
} from "@/lib/panels/layout";

describe("panelLayout", () => {
  it("defaults the Notes (shell) panel to the right dock ahead of AI", () => {
    expect(visibleTabs(DEFAULT_PANEL_LAYOUT, "right")).toEqual([
      "shell",
      "ai",
    ]);
    expect(DEFAULT_PANEL_LAYOUT.active.right).toBe("shell");
    expect(DEFAULT_PANEL_LAYOUT.visible.library).toBe(false);
  });

  it("moves Files from left to right beside the others", () => {
    const next = movePanel(DEFAULT_PANEL_LAYOUT, "files", "right");
    expect(visibleTabs(next, "left")).toEqual([]);
    expect(visibleTabs(next, "right")).toEqual(["shell", "ai", "files"]);
    expect(next.active.right).toBe("files");
    expect(next.home.files).toBe("right");
  });

  it("pops Shell out then pops in on bottom", () => {
    let layout = showPanel(DEFAULT_PANEL_LAYOUT, "shell", "bottom");
    expect(visibleTabs(layout, "bottom")).toEqual(["shell"]);
    layout = popOutPanel(layout, "shell");
    expect(layout.floating).toContain("shell");
    expect(layout.visible.shell).toBe(false);
    expect(visibleTabs(layout, "bottom")).toEqual([]);
    layout = popInPanel(layout, "shell", "left");
    expect(layout.floating).not.toContain("shell");
    expect(visibleTabs(layout, "left")).toEqual(["files", "shell"]);
    expect(layout.active.left).toBe("shell");
  });

  it("closes and restores to home side", () => {
    let layout = movePanel(DEFAULT_PANEL_LAYOUT, "ai", "bottom");
    layout = closePanel(layout, "ai");
    expect(layout.visible.ai).toBe(false);
    expect(visibleTabs(layout, "bottom")).toEqual([]);
    layout = showPanel(layout, "ai");
    expect(visibleTabs(layout, "bottom")).toEqual(["ai"]);
  });

  it("migrates legacy prefs", () => {
    const layout = panelLayoutFromLegacy({
      leftOpen: true,
      rightOpen: false,
      shellOpen: true,
      leftWidth: 200,
      shellHeight: 300,
    });
    expect(layout.visible.files).toBe(true);
    expect(layout.visible.ai).toBe(false);
    expect(layout.visible.shell).toBe(true);
    expect(visibleTabs(layout, "bottom")).toEqual(["shell"]);
    expect(layout.sizes.left).toBe(200);
    expect(layout.sizes.bottom).toBe(300);
  });
});
