import { Editor, Mark, Node, mergeAttributes } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MARKERS_OPTIONS,
  htmlForPublishTarget,
} from "@/lib/export/clipboardHtml";
import {
  analyzePublishInventory,
  inventorySummary,
} from "@/lib/export/publishChecklist";
import {
  SUBSTACK_FOOTNOTE_HELPER,
  substackFootnoteBookmarklet,
} from "@/lib/export/substackEditorHelper";

const ESSAY = `---
title: Everything
---

Energy is mc<sup>2</sup> and water is H<sub>2</sub>O.[^1]

Inline $x^2$ math.

$$
\\frac{a}{b}
$$

:::poetry
<sup>27</sup>All creatures look to You
  to give them their food in due season.

When You open Your hand,
  they are satisfied.
:::

![Chart](https://abc.supabase.co/storage/v1/object/sign/assets/a.png?token=t)

![Local](./local.png)

| a | b |
| - | - |
| 1 | 2 |

Second claim.[^2]

[^1]: First note.
[^2]: Second note with *emphasis*.
`;

describe("publish inventory", () => {
  it("counts everything that will not paste cleanly", () => {
    const inv = analyzePublishInventory(ESSAY);
    expect(inv.footnotes).toBe(2);
    expect(inv.images.total).toBe(2);
    expect(inv.images.expiring).toBe(1);
    expect(inv.images.relative).toBe(1);
    expect(inv.scripts).toBe(3);
    expect(inv.inlineMath).toBe(1);
    expect(inv.blockMath).toBe(1);
    expect(inv.poems).toBe(1);
    expect(inv.tables).toBe(1);
    expect(
      inventorySummary(inv, { footnotes: true, images: true })
    ).toContain("2 footnote markers");
  });

  it("is empty for a plain essay", () => {
    const inv = analyzePublishInventory("# Hi\n\nJust **text** and a [link](https://a.b).\n");
    expect(inv.footnotes + inv.images.total + inv.scripts + inv.poems).toBe(0);
  });
});

describe("markers copy options", () => {
  it("leaves helper markers for every checked item", () => {
    const { html } = htmlForPublishTarget(ESSAY, "markers");
    expect(html).toContain("mc{sup:2}");
    expect(html).toContain("H{sub:2}O");
    expect(html).toContain("[1]");
    expect(html).toContain("$x^2$");
    expect(html).toContain("<p>$$\\frac{a}{b}$$</p>");
    expect(html).toContain("<p>{poetry}</p>");
    expect(html).toContain("<p>{/poetry}</p>");
    expect(html).toContain("{sup:27}All creatures look to You<br>");
    expect(html).toContain("&nbsp;&nbsp;to give them");
    expect(html).toContain("<img");
    expect(html).not.toContain("katex");
    expect(html).not.toContain("<sup>");
  });

  it("pastes static fallbacks when items are unchecked", () => {
    const { html } = htmlForPublishTarget(ESSAY, "markers", {
      footnotes: false,
      images: false,
      superscripts: false,
      math: false,
      poetry: false,
    });
    expect(html).toContain("mc²");
    expect(html).toContain("H₂O");
    expect(html).not.toContain("[1]");
    expect(html).toContain("¹");
    expect(html).toContain("<pre><code>\\frac{a}{b}</code></pre>");
    expect(html).not.toContain("{poetry}");
    expect(html).toContain("²⁷All creatures look to You<br>");
    expect(html).not.toContain("<img");
    expect(html).toContain("<p>Notes</p>");
  });

  it("keeps LaTeX source (not KaTeX HTML) in the superscripts copy", () => {
    const { html } = htmlForPublishTarget(ESSAY, "superscripts");
    expect(html).not.toContain("katex");
    expect(html).toContain("$x^2$");
    expect(html).toContain("to give them");
  });

  it("keeps the rendered math in linked HTML", () => {
    const { html } = htmlForPublishTarget(ESSAY, "html");
    expect(html).toContain("katex");
  });
});

describe("bookmarklet", () => {
  it("stays well under browser bookmark URL limits", () => {
    expect(substackFootnoteBookmarklet().length).toBeLessThan(30_000);
  });
});

/* ---------- helper against a Substack-like editor ---------- */

const Superscript = Mark.create({
  name: "superscript",
  parseHTML: () => [{ tag: "sup" }],
  renderHTML: ({ HTMLAttributes }) => ["sup", HTMLAttributes, 0],
});

const LatexBlock = Node.create({
  name: "latex_block",
  group: "block",
  atom: true,
  addAttributes: () => ({ expression: { default: "" } }),
  parseHTML: () => [{ tag: "div[data-latex-block]" }],
  renderHTML: ({ HTMLAttributes }) => [
    "div",
    mergeAttributes(HTMLAttributes, { "data-latex-block": "" }),
  ],
});

const Poem = Node.create({
  name: "poem",
  group: "block",
  content: "paragraph+",
  parseHTML: () => [{ tag: "div[data-poem]" }],
  renderHTML: () => ["div", { "data-poem": "" }, 0],
});

const FootnoteAnchor = Node.create({
  name: "footnoteAnchor",
  group: "inline",
  inline: true,
  atom: true,
  renderHTML: () => ["sup", { class: "anchor" }],
});

const Footnote = Node.create({
  name: "footnote",
  group: "block",
  content: "paragraph+",
  renderHTML: () => ["div", { class: "fn" }, 0],
  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            const tr = state.tr.replaceSelectionWith(
              state.schema.nodes.footnoteAnchor.create(),
              false
            );
            tr.insert(
              tr.doc.content.size,
              state.schema.nodes.footnote.create(
                null,
                state.schema.nodes.paragraph.create()
              )
            );
            dispatch(tr);
          }
          return true;
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    substackFootnote: { insertFootnote: () => ReturnType };
  }
}

function substackEditor(html: string, extra: "full" | "bare" = "full") {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit,
      Image,
      Footnote,
      FootnoteAnchor,
      ...(extra === "full" ? [Superscript, LatexBlock, Poem] : []),
    ],
    content: html,
  });
}

function runHelper(): string {
  let message = "";
  vi.stubGlobal("alert", (text: string) => {
    message = text;
  });
  new Function(SUBSTACK_FOOTNOTE_HELPER)();
  return message;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Substack helper", () => {
  it("converts every marker type in one run", () => {
    const { html } = htmlForPublishTarget(ESSAY, "markers", DEFAULT_MARKERS_OPTIONS);
    const editor = substackEditor(html);
    try {
      const message = runHelper();
      const json = JSON.stringify(editor.getJSON());
      const text = editor.state.doc.textContent;

      expect(message).toContain("Footnotes: 2 inserted");
      expect(message).toContain("LaTeX: 1 of 1");
      expect(message).toContain("Poetry: 1 poem(s) set as poem");
      expect(message).toMatch(/Superscripts: \d+ formatted/);
      expect(message).toContain(
        "Images: 2 of 2 still load from outside Substack"
      );

      expect(text).not.toMatch(/\{(sup|sub|poetry|\/poetry)/);
      expect(text).not.toContain("[1]");
      expect(text).not.toContain("Notes");
      expect(json).toContain('"expression":"\\\\frac{a}{b}"');
      expect(json).toContain('"type":"poem"');
      expect(json).toContain('"type":"superscript"');

      const footnotes: string[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnote") footnotes.push(node.textContent);
      });
      expect(footnotes).toEqual(["First note.", "Second note with emphasis."]);
    } finally {
      editor.destroy();
    }
  });

  it("falls back and reports when the editor lacks LaTeX, poem, and sup", () => {
    const { html } = htmlForPublishTarget(ESSAY, "markers");
    const editor = substackEditor(html, "bare");
    try {
      const message = runHelper();
      const text = editor.state.doc.textContent;
      expect(message).toContain("no LaTeX block");
      expect(message).toContain("no poem block");
      expect(message).toContain("plain/Unicode");
      expect(message).toContain("Footnotes: 2 inserted");
      expect(text).toContain("mc²");
      expect(text).toContain("$$\\frac{a}{b}$$");
      expect(text).not.toContain("{poetry}");
      expect(text).toContain("All creatures look to You");
    } finally {
      editor.destroy();
    }
  });

  it("keeps the Notes list when footnotes were pasted static", () => {
    const { html } = htmlForPublishTarget(ESSAY, "markers", {
      ...DEFAULT_MARKERS_OPTIONS,
      footnotes: false,
    });
    const editor = substackEditor(html);
    try {
      runHelper();
      expect(editor.state.doc.textContent).toContain("First note.");
      expect(editor.state.doc.textContent).toContain("Notes");
    } finally {
      editor.destroy();
    }
  });
});
