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

  it("reorders a chip under the pointer instead of always sending it to the end", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <EditorPrefsProvider prefs={mergePrefs({})} updatePrefs={() => {}}>
          <ToolbarLayoutEditor />
        </EditorPrefsProvider>
      );
    });
    const bold = host.querySelector<HTMLElement>('[data-toolbar-drop="bar:7"]');
    const link = host.querySelector<HTMLElement>('[data-toolbar-drop="bar:11"]');
    expect(bold).toBeTruthy();
    expect(link).toBeTruthy();
    expect(bold?.textContent).toContain("Bold");
    expect(link?.textContent).toContain("Link");
    const point = vi
      .spyOn(document, "elementFromPoint")
      .mockReturnValue(link as HTMLElement);
    document.elementsFromPoint = () => [link as HTMLElement];
    act(() => {
      bold!.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          button: 0,
          pointerId: 1,
        })
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 80,
          clientY: 10,
          pointerId: 1,
        })
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: 80,
          clientY: 10,
          pointerId: 1,
        })
      );
    });
    point.mockRestore();
    Reflect.deleteProperty(document, "elementsFromPoint");
    const labels = [...host.querySelectorAll("[data-toolbar-drop]")].map((node) =>
      node.textContent?.trim()
    );
    const boldAt = labels.indexOf("Bold");
    const linkAt = labels.indexOf("Link");
    expect(linkAt).toBeGreaterThan(-1);
    expect(boldAt).toBeGreaterThan(-1);
    expect(Math.abs(boldAt - linkAt)).toBe(1);
  });
});
