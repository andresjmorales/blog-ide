import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { EditorPrefsProvider } from "@/components/EditorPrefsContext";
import { SettingsPanel } from "@/components/SettingsPanel";
import { mergePrefs } from "@/lib/settings";

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
    expect(host!.textContent).toContain("Pushbullet");
    expect(host!.textContent).toContain("ntfy");
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

  it("lets you turn off Harper issue types and edit the dictionary", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <EditorPrefsProvider
          prefs={mergePrefs({ spellcheckEnabled: true })}
          updatePrefs={() => {}}
        >
          <SettingsPanel
            open
            onClose={() => {}}
            previewMode
            initialTab="editor"
          />
        </EditorPrefsProvider>
      );
    });
    expect(host!.textContent).toContain("Issue types");
    expect(host!.textContent).toContain("Readability");
    expect(host!.textContent).toContain("Long sentences and similar");
    expect(host!.textContent).toContain("Dictionary");
    expect(
      host!.querySelector('input[aria-label="Add a word to the dictionary"]')
    ).toBeTruthy();
  });
});
