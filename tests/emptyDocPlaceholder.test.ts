import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

/**
 * Regression for: empty essays showed no "Start writing…" placeholder and a
 * gap cursor instead of a caret. parseBody("") returned a doc with zero
 * children, so the editor rendered no paragraph at all — nothing to focus,
 * nothing to decorate.
 */

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      ...createExtensions(),
      Placeholder.configure({
        placeholder: "Start writing…",
        showOnlyCurrent: false,
      }),
    ],
    content: parseBody(body),
  });
}

describe("empty document placeholder", () => {
  it("parseBody('') yields a doc with one empty paragraph", () => {
    const doc = parseBody("");
    expect(doc.content).toEqual([{ type: "paragraph" }]);
  });

  it("an unfocused empty editor shows the placeholder decoration", () => {
    const editor = makeEditor("");
    try {
      const p = editor.view.dom.querySelector("p.is-editor-empty");
      expect(p).not.toBeNull();
      expect(p?.getAttribute("data-placeholder")).toBe("Start writing…");
    } finally {
      editor.destroy();
    }
  });

  it("a non-empty doc shows no editor-empty decoration", () => {
    const editor = makeEditor("Some prose.");
    try {
      expect(editor.view.dom.querySelector("p.is-editor-empty")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("the injected empty paragraph serializes back to an empty body", () => {
    expect(serializeBody(parseBody("")).trim()).toBe("");
  });
});
