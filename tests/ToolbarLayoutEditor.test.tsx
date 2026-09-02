import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { EditorPrefsProvider } from "@/components/EditorPrefsContext";
import { ToolbarLayoutEditor } from "@/components/ToolbarLayoutEditor";
import { mergePrefs } from "@/lib/settings";

describe("ToolbarLayoutEditor", () => {
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

  it("shows the toolbar, Aa+ overflow, and save controls", () => {
    const updatePrefs = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <EditorPrefsProvider prefs={mergePrefs({})} updatePrefs={updatePrefs}>
          <ToolbarLayoutEditor />
        </EditorPrefsProvider>
      );
    });
    expect(host.textContent).toContain("Rearrange toolbar");
    expect(host.textContent).toContain("Inline code");
    expect(host.textContent).toContain("overflow");
    const save = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Save")
    );
    expect(save?.disabled).toBe(true);
    const addDivider = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Add divider")
    );
    act(() => {
      addDivider!.click();
    });
    expect(save?.disabled).toBe(false);
    act(() => {
      save!.click();
    });
    expect(updatePrefs).toHaveBeenCalled();
    const saved = updatePrefs.mock.calls[0]?.[0];
    expect(saved.toolbarLayout?.some((slot: { type: string }) => slot.type === "divider")).toBe(
      true
    );
  });
});
