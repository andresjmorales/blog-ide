import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { onEditorDocChange } from "@/lib/editor/workSchedule";

describe("onEditorDocChange", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("fires for silent whole-document swaps (GitHub pull) that skip update", () => {
    editor = new Editor({ extensions: [StarterKit], content: "<p>one two</p>" });
    const onUpdate = vi.fn();
    const onChange = vi.fn();
    editor.on("update", onUpdate);
    const stop = onEditorDocChange(editor, onChange);

    editor.commands.setContent("<p>one two three</p>", { emitUpdate: false });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(1);

    // Selection-only transactions are not document changes.
    editor.commands.setTextSelection(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    stop();
    editor.commands.insertContent("x");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
