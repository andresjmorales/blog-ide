import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Editor } from "@tiptap/core";
import { EditorPrefsProvider } from "@/components/EditorPrefsContext";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { mergePrefs } from "@/lib/settings";

describe("FormattingToolbar", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let editor: Editor | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
    editor?.destroy();
    editor = null;
  });

  it("places Aa+ after the link and keeps inline code inside it", () => {
    editor = new Editor({
      extensions: createExtensions(),
      content: parseBody("Hello.\n"),
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <EditorPrefsProvider prefs={mergePrefs({})} updatePrefs={() => {}}>
          <FormattingToolbar
            editor={editor!}
            onOpenFind={() => {}}
            onOpenCitation={() => {}}
            cleanupOpen={false}
          />
        </EditorPrefsProvider>
      );
    });
    const toolbar = host.querySelector('[aria-label="Formatting"]');
    expect(toolbar).toBeTruthy();
    const link = toolbar!.querySelector<HTMLButtonElement>(
      'button[title="Add or edit link (Ctrl+K)"]'
    );
    const overflow = toolbar!.querySelector<HTMLButtonElement>(
      'button[title="More formatting"]'
    );
    expect(link).toBeTruthy();
    expect(overflow?.textContent).toContain("Aa+");
    expect(
      toolbar!.querySelector('button[title="Inline code (Ctrl+E)"]')
    ).toBeNull();
    const buttons = [...toolbar!.querySelectorAll("button")];
    expect(buttons.indexOf(overflow!)).toBeGreaterThan(buttons.indexOf(link!));
  });
});
