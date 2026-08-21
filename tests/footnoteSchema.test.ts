import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import {
  createFootnoteExtensions,
  footnoteSchemaAllowsImages,
} from "@/lib/editor/footnoteSchema";

describe("footnote schema", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("does not register image or heading nodes", () => {
    expect(footnoteSchemaAllowsImages()).toBe(false);
    const element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: createFootnoteExtensions(),
      content: "A note",
      contentType: "markdown",
    });
    expect(editor.schema.nodes.image).toBeUndefined();
    expect(editor.schema.nodes.imageWithCaption).toBeUndefined();
    expect(editor.schema.nodes.heading).toBeUndefined();
    expect(editor.schema.nodes.footnoteRef).toBeUndefined();
  });

  it("records undo history for nested note edits", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    editor = new Editor({
      element,
      extensions: createFootnoteExtensions({ typography: false }),
      content: "A note",
      contentType: "markdown",
    });
    expect(editor.can().undo()).toBe(false);
    editor.commands.insertContent(" more");
    expect(editor.getText()).toContain("more");
    expect(editor.can().undo()).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).not.toContain("more");
    expect(editor.can().redo()).toBe(true);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getText()).toContain("more");
  });
});
