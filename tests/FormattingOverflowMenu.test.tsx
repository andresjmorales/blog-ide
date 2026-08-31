import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Editor } from "@tiptap/core";
import { FormattingOverflowMenu } from "@/components/FormattingOverflowMenu";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

describe("FormattingOverflowMenu", () => {
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

  it("lists superscript, subscript, code block, and convert case", () => {
    editor = new Editor({
      extensions: createExtensions(),
      content: parseBody("Hello.\n"),
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<FormattingOverflowMenu editor={editor!} />);
    });
    const button = host.querySelector<HTMLButtonElement>(
      'button[title="More formatting"]'
    );
    expect(button?.textContent).toContain("Aa");
    act(() => {
      button!.click();
    });
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent?.replace("‹", "").trim()
    );
    expect(labels).toContain("Superscript");
    expect(labels).toContain("Subscript");
    expect(labels).toContain("Code block");
    expect(labels).toContain("Convert case");
  });
});
