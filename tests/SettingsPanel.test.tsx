import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { SettingsPanel } from "@/components/SettingsPanel";

describe("SettingsPanel", () => {
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

  function render(initialTab?: "account" | "editor" | "markdown" | "integrations") {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <SettingsPanel
          open
          onClose={() => {}}
          previewMode
          initialTab={initialTab}
        />
      );
    });
  }

  function tabLabels() {
    return [...host!.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
  }

  it("shows former Preferences as Settings tabs", () => {
    render();
    expect(tabLabels()).toEqual([
      "Account",
      "Editor",
      "Markdown",
      "Storage",
      "Integrations",
    ]);
    expect(host!.textContent).not.toContain("Preferences");
  });

  it("keeps Open Notes on phone on Editor, not Account", () => {
    render();
    expect(host!.textContent).not.toContain("Open Notes on phone");
    const editorTab = [...host!.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "Editor"
    ) as HTMLButtonElement;
    act(() => {
      editorTab.click();
    });
    expect(host!.textContent).toContain("Open Notes on phone");
  });

  it("does not offer an AI import assist toggle", () => {
    render("integrations");
    expect(host!.textContent).toContain("AI API keys");
    expect(host!.textContent).not.toContain("AI import assist");
  });

  it("moves long setting copy behind info controls", () => {
    render("markdown");
    expect(host!.textContent).toContain("Shortcuts");
    expect(host!.textContent).not.toContain("Auto-transforms while typing");
    expect(
      host!.querySelectorAll('button[aria-label="More information"]').length
    ).toBeGreaterThan(0);
  });
});
