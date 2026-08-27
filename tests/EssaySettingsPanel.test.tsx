import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { EssaySettingsPanel } from "@/components/EssaySettingsPanel";

describe("EssaySettingsPanel", () => {
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

  function render(props: {
    nodeId?: string | null;
    initialTab?: "title" | "writing" | "github";
    spellcheckOverride?: "on" | "off" | null;
  } = {}) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <EssaySettingsPanel
          open
          onClose={() => {}}
          title="My Essay"
          onTitleChange={() => {}}
          documentLanguages={[]}
          onDocumentLanguagesChange={() => {}}
          spellcheckOverride={
            props.spellcheckOverride === undefined
              ? null
              : props.spellcheckOverride
          }
          onSpellcheckOverrideChange={() => {}}
          previewMode
          nodeId={props.nodeId === undefined ? "doc-1" : props.nodeId}
          initialTab={props.initialTab}
        />
      );
    });
  }

  it("adds a GitHub tab next to Title and Writing check", () => {
    render();
    const tabs = [...host!.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent
    );
    expect(tabs).toEqual(["Title", "Writing check", "GitHub"]);
  });

  it("opens on the GitHub mapping tab from the essay kebab", () => {
    render({ initialTab: "github" });
    const githubTab = [...host!.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "GitHub"
    );
    expect(githubTab?.getAttribute("aria-selected")).toBe("true");
    expect(host!.textContent).toContain("Sign in to map this essay");
  });

  it("hides GitHub when there is no document", () => {
    render({ nodeId: null });
    const tabs = [...host!.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent
    );
    expect(tabs).toEqual(["Title", "Writing check"]);
  });

  it("points at Settings for issue types and the dictionary", () => {
    render({ initialTab: "writing", spellcheckOverride: "on" });
    expect(host!.textContent).toContain(
      "Issue types and your dictionary are under Settings → Editor"
    );
  });
});
