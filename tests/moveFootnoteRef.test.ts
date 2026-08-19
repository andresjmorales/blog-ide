import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import {
  applyMoveFootnoteRef,
  findFootnoteRefAt,
  footnoteNumberAt,
  isBlockedFootnoteDropTarget,
  isNoOpFootnoteMove,
  listFootnoteRefs,
  mappedInsertPosAfterDelete,
  planMoveFootnoteRef,
  resolveFootnoteInsertPos,
  snapAroundFootnoteAtom,
} from "@/lib/editor/moveFootnoteRef";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions({ typography: false }),
    content: parseBody(body),
  });
}

function essayText(editor: Editor): string {
  return editor.state.doc.textBetween(
    0,
    editor.state.doc.content.size,
    "\n",
    ""
  );
}

function notes(editor: Editor) {
  return listFootnoteRefs(editor.state.doc).map((item, index) => ({
    number: index + 1,
    id: item.id,
    content: item.content,
    pos: item.pos,
    size: item.size,
  }));
}

function endOfFirst(editor: Editor, typeName: string): number {
  let end = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return true;
    end = pos + node.nodeSize - 1;
    return false;
  });
  return end;
}

function deletedFootnotes(editor: Editor) {
  const raw = editor.state.doc.attrs.deletedFootnotes;
  return Array.isArray(raw) ? raw : [];
}

function posInside(editor: Editor, typeName: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      found = pos + 1;
      return false;
    }
    return true;
  });
  return found;
}

const THREE_NOTES = [
  "Alpha.[^a] Bravo.[^b] Charlie.[^c]",
  "",
  "[^a]: First.",
  "[^b]: Second.",
  "[^c]: Third.",
  "",
].join("\n");

describe("footnote move helpers", () => {
  it("treats drop on or immediately after the same atom as a no-op", () => {
    expect(isNoOpFootnoteMove(10, 1, 10)).toBe(true);
    expect(isNoOpFootnoteMove(10, 1, 11)).toBe(true);
    expect(isNoOpFootnoteMove(10, 1, 12)).toBe(false);
    expect(isNoOpFootnoteMove(10, 1, 9)).toBe(false);
    expect(mappedInsertPosAfterDelete(10, 1, 20)).toBe(19);
    expect(mappedInsertPosAfterDelete(10, 1, 4)).toBe(4);
  });

  it("snaps a drop on another footnote to before or after it", () => {
    const editor = makeEditor("X[^a]Y\n\n[^a]: Note.\n");
    try {
      const [ref] = listFootnoteRefs(editor.state.doc);
      expect(ref).toBeTruthy();
      const leftAt = (pos: number) => (pos === ref!.pos ? 100 : 120);
      expect(
        snapAroundFootnoteAtom(editor.state.doc, ref!.pos, 105, leftAt)
      ).toBe(ref!.pos);
      expect(
        snapAroundFootnoteAtom(editor.state.doc, ref!.pos, 115, leftAt)
      ).toBe(ref!.pos + ref!.size);
      expect(
        snapAroundFootnoteAtom(
          editor.state.doc,
          ref!.pos + ref!.size,
          105,
          leftAt
        )
      ).toBe(ref!.pos);
    } finally {
      editor.destroy();
    }
  });

  it("ignores drops on footnote chrome, the rail, and the toolbar", () => {
    function el(className: string) {
      const node = document.createElement("div");
      node.className = className;
      document.body.appendChild(node);
      return node;
    }
    const pin = el("footnote-pin");
    const card = el("footnote-card");
    const rail = el("sidenote-rail");
    const toolbar = el("blogide-editor-toolbar");
    const nested = document.createElement("button");
    pin.appendChild(nested);
    const essay = el("ProseMirror");
    try {
      expect(isBlockedFootnoteDropTarget(nested)).toBe(true);
      expect(isBlockedFootnoteDropTarget(card)).toBe(true);
      expect(isBlockedFootnoteDropTarget(rail)).toBe(true);
      expect(isBlockedFootnoteDropTarget(toolbar)).toBe(true);
      expect(isBlockedFootnoteDropTarget(essay)).toBe(false);
      expect(isBlockedFootnoteDropTarget(null)).toBe(false);
    } finally {
      pin.remove();
      card.remove();
      rail.remove();
      toolbar.remove();
      essay.remove();
    }
  });
});

describe("moveFootnoteRef", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("moves a mark to the next sentence without rewriting note bodies", () => {
    editor = makeEditor("Hello.[^a] Next sentence.\n\n[^a]: Keep me.\n");
    const [note] = notes(editor);
    const end = endOfFirst(editor, "paragraph");
    const before = essayText(editor);
    expect(editor.commands.moveFootnoteRef(note.pos, end)).toBe(true);
    expect(essayText(editor)).toBe(before);
    expect(notes(editor).map((item) => item.content)).toEqual(["Keep me."]);
    expect(serializeBody(editor.getJSON())).toContain("Hello. Next sentence.[^1]");
    expect(serializeBody(editor.getJSON())).toContain("[^1]: Keep me.");
    expect(deletedFootnotes(editor)).toEqual([]);
  });

  it("reorders numbers while keeping each id tied to its content", () => {
    editor = makeEditor(THREE_NOTES);
    const before = notes(editor);
    expect(before.map((item) => item.content)).toEqual([
      "First.",
      "Second.",
      "Third.",
    ]);
    const prose = essayText(editor);
    const c = before[2]!;
    const a = before[0]!;

    expect(editor.commands.moveFootnoteRef(c.pos, a.pos)).toBe(true);

    const after = notes(editor);
    expect(after.map((item) => [item.id, item.content])).toEqual([
      [c.id, "Third."],
      [a.id, "First."],
      [before[1]!.id, "Second."],
    ]);
    expect(after.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(footnoteNumberAt(editor.state.doc, after[0]!.pos)).toBe(1);
    expect(footnoteNumberAt(editor.state.doc, after[2]!.pos)).toBe(3);
    expect(essayText(editor)).toBe(prose);
    expect(serializeBody(editor.getJSON())).toBe(
      "Alpha.[^1][^2] Bravo.[^3] Charlie.\n\n[^1]: Third.\n[^2]: First.\n[^3]: Second."
    );
    expect(deletedFootnotes(editor)).toEqual([]);
  });

  it("moves the first note to the end and the middle note after the last", () => {
    editor = makeEditor(THREE_NOTES);
    const start = notes(editor);
    const a = start[0]!;
    const b = start[1]!;
    const c = start[2]!;
    const afterC = c.pos + c.size;

    expect(editor.commands.moveFootnoteRef(a.pos, afterC)).toBe(true);
    expect(notes(editor).map((item) => item.id)).toEqual([b.id, c.id, a.id]);
    expect(notes(editor).map((item) => item.content)).toEqual([
      "Second.",
      "Third.",
      "First.",
    ]);

    const mid = notes(editor);
    const bNow = mid.find((item) => item.id === b.id)!;
    const aNow = mid.find((item) => item.id === a.id)!;
    expect(
      editor.commands.moveFootnoteRef(bNow.pos, aNow.pos + 1)
    ).toBe(true);
    expect(notes(editor).map((item) => item.id)).toEqual([c.id, a.id, b.id]);
    expect(notes(editor).map((item) => item.content)).toEqual([
      "Third.",
      "First.",
      "Second.",
    ]);
    expect(deletedFootnotes(editor)).toEqual([]);
  });

  it("swaps adjacent footnotes from either direction", () => {
    editor = makeEditor("X[^a][^b]Y\n\n[^a]: Alpha.\n[^b]: Beta.\n");
    const [first, second] = notes(editor);
    const prose = essayText(editor);

    expect(editor.commands.moveFootnoteRef(second.pos, first.pos)).toBe(true);
    expect(notes(editor).map((item) => item.content)).toEqual([
      "Beta.",
      "Alpha.",
    ]);
    expect(essayText(editor)).toBe(prose);

    const [beta, alpha] = notes(editor);
    expect(
      editor.commands.moveFootnoteRef(alpha.pos, beta.pos)
    ).toBe(true);
    expect(notes(editor).map((item) => item.content)).toEqual([
      "Alpha.",
      "Beta.",
    ]);
    expect(essayText(editor)).toBe(prose);
  });

  it("does not shuffle five notes when the second mark is dragged past the fourth", () => {
    editor = makeEditor(
      [
        "A.[^a] B.[^b] C.[^c] D.[^d] E.[^e]",
        "",
        "[^a]: One.",
        "[^b]: Two.",
        "[^c]: Three.",
        "[^d]: Four.",
        "[^e]: Five.",
        "",
      ].join("\n")
    );
    const start = notes(editor);
    const b = start[1]!;
    const d = start[3]!;
    expect(editor.commands.moveFootnoteRef(b.pos, d.pos + d.size)).toBe(true);
    expect(notes(editor).map((item) => item.content)).toEqual([
      "One.",
      "Three.",
      "Four.",
      "Two.",
      "Five.",
    ]);
    expect(notes(editor).map((item) => item.id)).toEqual([
      start[0]!.id,
      start[2]!.id,
      start[3]!.id,
      start[1]!.id,
      start[4]!.id,
    ]);
    expect(serializeBody(editor.getJSON())).toContain("[^4]: Two.");
    expect(deletedFootnotes(editor)).toEqual([]);
  });

  it("returns false for a drop on itself or immediately after itself", () => {
    editor = makeEditor(THREE_NOTES);
    const [a] = notes(editor);
    const snapshot = editor.getJSON();
    expect(editor.commands.moveFootnoteRef(a.pos, a.pos)).toBe(false);
    expect(editor.commands.moveFootnoteRef(a.pos, a.pos + 1)).toBe(false);
    expect(editor.getJSON()).toEqual(snapshot);
  });

  it("refuses a drop inside a code block without changing the document", () => {
    editor = makeEditor(
      "Hello.[^a]\n\n```\nconst x = 1;\n```\n\n[^a]: Note.\n"
    );
    const [note] = notes(editor);
    const codePos = posInside(editor, "codeBlock");
    expect(codePos).not.toBeNull();
    expect(resolveFootnoteInsertPos(editor.state.doc, codePos!)).toBeNull();
    const snapshot = editor.getJSON();
    expect(editor.commands.moveFootnoteRef(note.pos, codePos!)).toBe(false);
    expect(editor.getJSON()).toEqual(snapshot);
    expect(planMoveFootnoteRef(editor.state.doc, note.pos, codePos!).reason).toBe(
      "invalid"
    );
  });

  it("can move a note into a heading or the start of a paragraph", () => {
    editor = makeEditor(
      "# Title\n\nHello.[^a] World.\n\n[^a]: Note.\n"
    );
    const [note] = notes(editor);
    const headingPos = posInside(editor, "heading");
    expect(headingPos).not.toBeNull();
    expect(editor.commands.moveFootnoteRef(note.pos, headingPos!)).toBe(true);
    expect(serializeBody(editor.getJSON())).toMatch(/^# \[\^1\]Title/);
    expect(notes(editor)[0]?.content).toBe("Note.");

    const paraStart = posInside(editor, "paragraph");
    expect(paraStart).not.toBeNull();
    const current = notes(editor)[0]!;
    expect(editor.commands.moveFootnoteRef(current.pos, paraStart!)).toBe(true);
    expect(serializeBody(editor.getJSON())).toMatch(/\[\^1\]Hello\. World\./);
    expect(deletedFootnotes(editor)).toEqual([]);
  });

  it("moves a note across paragraphs without merging them", () => {
    editor = makeEditor(
      "First.[^a]\n\nSecond.[^b]\n\n[^a]: Alpha.\n[^b]: Beta.\n"
    );
    const start = notes(editor);
    const a = start[0]!;
    const b = start[1]!;
    expect(editor.commands.moveFootnoteRef(a.pos, b.pos + b.size)).toBe(true);
    const json = editor.getJSON();
    expect(json.content).toHaveLength(2);
    expect(serializeBody(json)).toBe(
      "First.\n\nSecond.[^1][^2]\n\n[^1]: Beta.\n[^2]: Alpha."
    );
    expect(essayText(editor)).toBe("First.\nSecond.");
  });

  it("undo restores the previous order and bodies in one step", () => {
    editor = makeEditor(THREE_NOTES);
    const before = notes(editor).map((item) => [item.id, item.content]);
    const markdown = serializeBody(editor.getJSON());
    const c = notes(editor)[2]!;
    const a = notes(editor)[0]!;
    expect(editor.commands.moveFootnoteRef(c.pos, a.pos)).toBe(true);
    expect(notes(editor).map((item) => item.content)).toEqual([
      "Third.",
      "First.",
      "Second.",
    ]);
    expect(editor.commands.undo()).toBe(true);
    expect(notes(editor).map((item) => [item.id, item.content])).toEqual(before);
    expect(serializeBody(editor.getJSON())).toBe(markdown);
    expect(deletedFootnotes(editor)).toEqual([]);
  });

  it("still archives a footnote that is actually deleted after a move", () => {
    editor = makeEditor(THREE_NOTES);
    const c = notes(editor)[2]!;
    const a = notes(editor)[0]!;
    expect(editor.commands.moveFootnoteRef(c.pos, a.pos)).toBe(true);
    const moved = notes(editor)[0]!;
    expect(findFootnoteRefAt(editor.state.doc, moved.pos)?.id).toBe(c.id);
    editor.commands.setTextSelection({
      from: moved.pos,
      to: moved.pos + 1,
    });
    expect(editor.commands.deleteSelection()).toBe(true);
    const archived = deletedFootnotes(editor);
    expect(archived).toHaveLength(1);
    expect(archived[0]?.id).toBe(c.id);
    expect(archived[0]?.content).toBe("Third.");
    expect(notes(editor).map((item) => item.content)).toEqual([
      "First.",
      "Second.",
    ]);
  });

  it("rejects a move from a position that is not a footnote", () => {
    editor = makeEditor(THREE_NOTES);
    expect(planMoveFootnoteRef(editor.state.doc, 2, 8).reason).toBe("missing");
    expect(applyMoveFootnoteRef(editor.state, 2, 8)).toBe(false);
  });

  it("keeps display numbers aligned with open-editor title order", () => {
    editor = makeEditor(THREE_NOTES);
    const start = notes(editor);
    const openIds = [start[0]!.id, start[2]!.id];
    expect(editor.commands.moveFootnoteRef(start[2]!.pos, start[0]!.pos)).toBe(
      true
    );
    const titles = notes(editor)
      .filter((item) => openIds.includes(item.id))
      .map((item) => ({ id: item.id, title: `Footnote ${item.number}` }));
    expect(titles).toEqual([
      { id: start[2]!.id, title: "Footnote 1" },
      { id: start[0]!.id, title: "Footnote 2" },
    ]);
  });
});
