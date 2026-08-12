import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

function selectInsideTable(editor: Editor) {
  let pos = 0;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      pos = position + 1;
      return false;
    }
    return true;
  });
  editor.commands.setTextSelection(pos);
}

describe("table commands", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("adds and removes rows/columns and can delete the table", () => {
    editor = makeEditor("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
    selectInsideTable(editor);
    expect(editor.isActive("table")).toBe(true);

    editor.chain().focus().addColumnAfter().run();
    expect(serializeBody(editor.getJSON())).toMatch(/\| A\s+\| B\s+\|/);

    editor.chain().focus().addRowAfter().run();
    const withRow = serializeBody(editor.getJSON());
    expect(withRow.split("\n").filter((line) => line.startsWith("|")).length).toBeGreaterThan(
      3
    );

    editor.chain().focus().deleteRow().run();
    editor.chain().focus().deleteColumn().run();
    editor.chain().focus().deleteTable().run();
    expect(serializeBody(editor.getJSON())).not.toContain("|");
  });
});
