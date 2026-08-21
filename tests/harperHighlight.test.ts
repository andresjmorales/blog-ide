import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  HarperHighlight,
  harperHighlightKey,
} from "@/lib/editor/harper/HarperHighlight";
import type { HarperHighlightState, HarperIssue } from "@/lib/editor/harper/types";
import {
  cacheGet,
  cacheSet,
  expandToWord,
  issuesFingerprint,
  mapHarperState,
} from "@/lib/editor/harper/mapIssues";
import { extractLintBlocks } from "@/lib/editor/harper/extractText";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [...createExtensions(), HarperHighlight],
    content: parseBody(body),
  });
}

function issue(
  from: number,
  to: number,
  problem: string,
  kind = "Spelling"
): HarperIssue {
  return {
    id: `${from}-${to}-${kind}-0`,
    from,
    to,
    kind,
    message: `Did you mean to spell ${problem}?`,
    problem,
    suggestions: [],
  };
}

function seedHarper(editor: Editor, issues: HarperIssue[]): void {
  const state: HarperHighlightState = { issues, activeId: null };
  const tr = editor.state.tr.setMeta(harperHighlightKey, state);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

describe("harper mapIssues", () => {
  it("keeps distant underlines and drops the edited word", () => {
    const editor = makeEditor("mispelled word here\n\nseperate paragraph\n");
    try {
      const first = editor.state.doc.textBetween(0, editor.state.doc.content.size);
      const misspelledFrom = first.indexOf("mispelled") + 1;
      const misspelledTo = misspelledFrom + "mispelled".length;
      const seperateAt = first.indexOf("seperate") + 1;
      const seperateTo = seperateAt + "seperate".length;

      seedHarper(editor, [
        issue(misspelledFrom, misspelledTo, "mispelled"),
        issue(seperateAt, seperateTo, "seperate"),
      ]);

      const insertAt = misspelledFrom + 3;
      editor.commands.insertContentAt(insertAt, "x");

      const state = harperHighlightKey.getState(editor.state);
      expect(state?.issues.map((item) => item.problem)).toEqual(["seperate"]);
      expect(state?.issues[0]?.from).toBe(seperateAt + 1);
      expect(state?.issues[0]?.to).toBe(seperateTo + 1);
    } finally {
      editor.destroy();
    }
  });

  it("keeps a touching misspelling when only a footnote attr changes", () => {
    const editor = makeEditor("seperate[^1] claim.\n\n[^1]: old note\n");
    try {
      const text = editor.state.doc.textBetween(
        0,
        editor.state.doc.content.size
      );
      const from = text.indexOf("seperate") + 1;
      const to = from + "seperate".length;
      seedHarper(editor, [issue(from, to, "seperate")]);

      let footnotePos: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnoteRef") {
          footnotePos = pos;
          return false;
        }
      });
      expect(footnotePos).toBeTypeOf("number");
      const node = editor.state.doc.nodeAt(footnotePos!);
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(footnotePos!, undefined, {
          ...node!.attrs,
          content: "updated note body",
        })
      );

      const state = harperHighlightKey.getState(editor.state);
      expect(state?.issues).toHaveLength(1);
      expect(state?.issues[0]?.from).toBe(from);
      expect(state?.issues[0]?.to).toBe(to);
      expect(state?.issues[0]?.problem).toBe("seperate");
    } finally {
      editor.destroy();
    }
  });

  it("expands a caret into the surrounding word", () => {
    const editor = makeEditor("alpha beta gamma\n");
    try {
      const text = editor.state.doc.textBetween(
        0,
        editor.state.doc.content.size
      );
      const betaAt = text.indexOf("beta") + 1;
      expect(expandToWord(editor.state.doc, betaAt + 2, betaAt + 2)).toEqual({
        from: betaAt,
        to: betaAt + 4,
      });
    } finally {
      editor.destroy();
    }
  });

  it("returns the same state object when nothing mapped", () => {
    const editor = makeEditor("hello world\n");
    try {
      const seeded = [issue(1, 6, "hello")];
      seedHarper(editor, seeded);
      const before = harperHighlightKey.getState(editor.state)!;
      const mapped = mapHarperState(before, editor.state.tr);
      expect(mapped).toBe(before);
    } finally {
      editor.destroy();
    }
  });
});

describe("harper block cache", () => {
  it("refreshes LRU order on get", () => {
    const cache = new Map<string, number>();
    cacheSet(cache, "a", 1);
    cacheSet(cache, "b", 2);
    expect(cacheGet(cache, "a")).toBe(1);
    expect([...cache.keys()]).toEqual(["b", "a"]);
  });

  it("fingerprints issues without ids", () => {
    expect(
      issuesFingerprint([issue(1, 5, "typo"), issue(8, 12, "err")])
    ).toBe("1:5:Spelling:typo|8:12:Spelling:err");
  });
});

describe("harper extractLintBlocks (editor)", () => {
  it("skips footnote and code-block text in a real document", () => {
    const editor = makeEditor(
      "Hello[^1] world.\n\n```\nmispelled\n```\n\n[^1]: footnote body\n"
    );
    try {
      const blocks = extractLintBlocks(editor.state.doc);
      expect(blocks.map((block) => block.text)).toEqual(["Hello world."]);
    } finally {
      editor.destroy();
    }
  });
});
