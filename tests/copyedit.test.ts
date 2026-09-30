import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import {
  applyMatches,
  collectBlockTexts,
  dashInventory,
  findDashes,
  runFormattingCheck,
} from "@/lib/editor/copyedit";
import {
  buildCopyeditRequest,
  isPlainTextPatch,
  locatePlainText,
  parseCopyeditReply,
} from "@/lib/ai/copyedit";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions({ typography: false }),
    content: parseBody(body),
  });
}

function body(editor: Editor): string {
  return serializeBody(editor.getJSON()).trim();
}

describe("dash converter", () => {
  it("converts British spaced en dashes to closed em dashes", () => {
    const editor = makeEditor("It was – as ever – late. Pages 12 – 14, good-faith, 1990–95.\n");
    try {
      const blocks = collectBlockTexts(editor.state.doc);
      const matches = findDashes(blocks, "spaced-en", "closed-em");
      // The 12 – 14 range is left alone.
      expect(matches).toHaveLength(2);
      applyMatches(editor, matches);
      expect(body(editor)).toBe(
        "It was—as ever—late. Pages 12 – 14, good-faith, 1990–95."
      );
    } finally {
      editor.destroy();
    }
  });

  it("converts across a link boundary without extending the link", () => {
    const editor = makeEditor("See [the paper](https://x.io) - it holds.\n");
    try {
      const matches = findDashes(
        collectBlockTexts(editor.state.doc),
        "spaced-hyphen",
        "closed-em"
      );
      applyMatches(editor, matches);
      expect(body(editor)).toBe("See [the paper](https://x.io)—it holds.");
    } finally {
      editor.destroy();
    }
  });

  it("keeps footnote atoms and never treats a leading hyphen as a dash", () => {
    const editor = makeEditor(
      "Claim - one[^1] and good-faith.\n\n- a list item - with an aside\n\n[^1]: Survives.\n"
    );
    try {
      applyMatches(
        editor,
        findDashes(collectBlockTexts(editor.state.doc), "spaced-hyphen", "spaced-en")
      );
      const md = body(editor);
      expect(md).toContain("Claim – one[^1] and good-faith.");
      expect(md).toContain("- a list item – with an aside");
      expect(md).toContain("[^1]: Survives.");
    } finally {
      editor.destroy();
    }
  });

  it("counts every form and skips inline code", () => {
    const editor = makeEditor(
      "a—b, c – d, e -- f, g - h, `x - y`, i — j\n"
    );
    try {
      const counts = dashInventory(collectBlockTexts(editor.state.doc));
      expect(counts).toEqual({
        "spaced-en": 1,
        "spaced-hyphen": 1,
        "double-hyphen": 1,
        "spaced-em": 1,
        "closed-em": 1,
      });
    } finally {
      editor.destroy();
    }
  });
});

describe("formatting check", () => {
  it("finds fixable issues and fixes them in one step each", () => {
    const editor = makeEditor(
      'He said "hi"  to the the dog , then left... See 12-14.\n\n## A\n\n#### B\n'
    );
    try {
      const issues = runFormattingCheck(editor.state.doc, {
        dashTarget: "closed-em",
      });
      const ids = issues.map((issue) => issue.id);
      expect(ids).toEqual([
        "straight-quotes",
        "double-spaces",
        "space-before-punct",
        "repeated-word",
        "three-dots",
        "digit-range",
        "heading-skip",
      ]);
      // Positions shift after each fix, so each fix runs from a fresh scan.
      for (const id of ids) {
        const fresh = runFormattingCheck(editor.state.doc, {
          dashTarget: "closed-em",
        }).find((issue) => issue.id === id);
        if (fresh) applyMatches(editor, fresh.matches);
      }
      expect(body(editor).split("\n")[0]).toBe(
        "He said “hi” to the the dog, then left… See 12–14."
      );
    } finally {
      editor.destroy();
    }
  });

  it("flags dashes that are off house style", () => {
    const editor = makeEditor("One—two and three – four.\n");
    try {
      const issue = runFormattingCheck(editor.state.doc, {
        dashTarget: "spaced-en",
      }).find((item) => item.id === "mixed-dashes");
      expect(issue?.matches).toHaveLength(1);
      applyMatches(editor, issue!.matches);
      expect(body(editor)).toBe("One – two and three – four.");
    } finally {
      editor.destroy();
    }
  });

  it("allows legitimate repeats like had had", () => {
    const editor = makeEditor("She had had enough.\n");
    try {
      const ids = runFormattingCheck(editor.state.doc, {
        dashTarget: "closed-em",
      }).map((issue) => issue.id);
      expect(ids).not.toContain("repeated-word");
    } finally {
      editor.destroy();
    }
  });
});

describe("AI copyedit", () => {
  it("pairs each patch with its label and keeps prose notes", () => {
    const reply = [
      "Typo: teh → the",
      "<<<SEARCH",
      "teh cat",
      "===",
      "the cat",
      ">>>REPLACE",
      "",
      "- **Spelling: colour → color**",
      "<<<SEARCH",
      "the colour",
      "===",
      "the color",
      ">>>REPLACE",
    ].join("\n");
    const { suggestions } = parseCopyeditReply(reply);
    expect(suggestions.map((s) => s.label)).toEqual([
      "Typo: teh → the",
      "Spelling: colour → color",
    ]);
    expect(parseCopyeditReply("Nothing to fix.").note).toBe("Nothing to fix.");
  });

  it("locates plain patches in the editor despite quote drift", () => {
    const editor = makeEditor("It’s **very** late, isn’t it.\n");
    try {
      const range = locatePlainText(editor.state.doc, "very late, isn't");
      expect(range).not.toBeNull();
      expect(editor.state.doc.textBetween(range!.from, range!.to)).toBe(
        "very late, isn’t"
      );
      expect(isPlainTextPatch({ search: "teh", replace: "the" })).toBe(true);
      expect(isPlainTextPatch({ search: "*teh*", replace: "*the*" })).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("scopes the request to the selection and names the house dash", () => {
    const { user } = buildCopyeditRequest({
      kind: "consistency",
      essayMarkdown: "Body.",
      selectionText: "Only this.",
      dashTarget: "spaced-en",
    });
    expect(user).toContain("Only this.");
    expect(user).toContain("word – word");
  });
});
