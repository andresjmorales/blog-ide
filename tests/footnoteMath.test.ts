import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";
import { createExtensions } from "@/lib/editor/extensions";
import {
  prepareFootnoteMarkdown,
  sliceFromFootnotePlainText,
  transformFootnotePastedHtml,
} from "@/lib/editor/footnoteNoteContent";
import {
  MATH_IN_SELECTION,
  mathInSelectionDecorations,
  renderMathPlaceholders,
} from "@/lib/editor/math";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { footnoteHtml } from "@/components/FootnoteSidenote";
import { footnoteIndexKey } from "@/lib/editor/footnoteNumbers";

function mount(options: ConstructorParameters<typeof Editor>[0]): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({ element, ...options });
}

function nodeNames(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.descendants((node) => {
    names.push(node.type.name);
  });
  return names;
}

describe("LaTeX in footnotes", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("parses $…$ in a note body into math and serializes it back", () => {
    const content = "Area is $\\pi r^2$, see $$E = mc^2$$ too.";
    editor = mount({
      extensions: createFootnoteExtensions(),
      content: prepareFootnoteMarkdown("Area is $\\pi r^2$ and $a_1 * b_2$."),
      contentType: "markdown",
    });
    expect(nodeNames(editor)).toContain("inlineMath");
    expect(editor.getMarkdown().trim()).toBe("Area is $\\pi r^2$ and $a_1 * b_2$.");
    // Prices stay text.
    expect(prepareFootnoteMarkdown("It cost $5 and $10.")).toBe(
      "It cost $5 and $10."
    );
    expect(prepareFootnoteMarkdown(content)).toContain("[[blogide-math-i:");
  });

  it("keeps note math through the essay markdown round-trip", () => {
    const body = "Claim.[^1]\n\n[^1]: Since $a^2 + b^2 = c^2$ holds.\n";
    const doc = parseBody(body);
    expect(serializeBody(doc).trim()).toBe(body.trim());
  });

  it("folds pasted plain-text math into math nodes", () => {
    editor = mount({
      extensions: createFootnoteExtensions(),
      content: "",
      contentType: "markdown",
    });
    const slice = sliceFromFootnotePlainText(
      editor.schema,
      "where \\(x^2\\) grows"
    );
    expect(slice).not.toBeNull();
    const names: string[] = [];
    slice!.content.descendants((node) => {
      names.push(node.type.name);
    });
    expect(names).toContain("inlineMath");
    expect(sliceFromFootnotePlainText(editor.schema, "no math here")).toBeNull();
    expect(sliceFromFootnotePlainText(editor.schema, "costs $5")).toBeNull();
  });

  it("drops nested footnote refs from pasted HTML", () => {
    const html =
      '<p>Text<sup data-footnote-ref="" data-id="a" data-content="x">?</sup> and $y$</p>';
    const next = transformFootnotePastedHtml(html);
    expect(next).not.toContain("data-footnote-ref");
    expect(next).toContain('data-inline-math=""');
  });

  it("renders note math with KaTeX in sidenotes / endnotes", () => {
    const html = footnoteHtml("Since $x^2$ grows.");
    expect(html).toContain("katex");
    expect(html).not.toContain("$x^2$");
    expect(renderMathPlaceholders("<p>plain</p>")).toBe("<p>plain</p>");
  });

  it("updates a footnote body by id from outside its card", () => {
    editor = mount({
      extensions: createExtensions(),
      content: parseBody("Claim.[^1]\n\n[^1]: Old note.\n"),
    });
    let id = "";
    editor.state.doc.descendants((node) => {
      if (node.type.name === "footnoteRef") id = String(node.attrs.id);
    });
    expect(editor.commands.updateFootnoteContent(id, "New $x$ note.")).toBe(true);
    expect(serializeBody(editor.getJSON())).toContain("[^1]: New $x$ note.");
    // The rail / Notes list index follows the edit.
    expect(footnoteIndexKey.getState(editor.state)?.notes[0]?.content).toBe(
      "New $x$ note."
    );
    expect(editor.commands.updateFootnoteContent("missing", "x")).toBe(false);
  });
});

describe("math selection tint", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("marks math fully inside a text selection", () => {
    editor = mount({
      extensions: createExtensions(),
      content: parseBody("Let $x$ be $y$ here.\n"),
    });
    const { state } = editor;
    expect(mathInSelectionDecorations(state)).toBeNull();
    const positions: number[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name === "inlineMath") positions.push(pos);
    });
    // Select from the start of the paragraph through the first math only.
    const selection = TextSelection.create(state.doc, 1, positions[0]! + 2);
    const decorations = mathInSelectionDecorations(
      state.apply(state.tr.setSelection(selection))
    );
    const found = decorations?.find() ?? [];
    expect(found).toHaveLength(1);
    expect(found[0]?.from).toBe(positions[0]);
    expect(found[0]?.spec[MATH_IN_SELECTION]).toBe(true);
  });
});

describe("prepareMath dollar escapes", () => {
  function mathBodies(text: string): string[] {
    const doc = parseBody(text);
    const found: string[] = [];
    JSON.stringify(doc, (key, value) => {
      if (value?.type === "inlineMath") found.push(value.attrs.latex);
      return value;
    });
    return found;
  }

  it("never opens or closes on an escaped dollar", () => {
    expect(
      mathBodies("It cost $5 and $10, or $83,000. Escaped \\$x\\$ stays.\n")
    ).toEqual([]);
    expect(mathBodies("Use \\$HOME and $y$.\n")).toEqual(["y"]);
  });

  it("does not pair across a bare dollar", () => {
    expect(mathBodies("From $5 and $10 to $x$.\n")).toEqual(["x"]);
  });

  it("still treats an escaped backslash before $ as a real delimiter", () => {
    expect(mathBodies("Path \\\\$x$ end.\n")).toEqual(["x"]);
  });
});

describe("multi-line LaTeX", () => {
  const CASES =
    "\\mathrm{Need}_\\text{spir} = \\begin{cases}\n0 \\text{ to } 100 & \\text{believer}\\\\\n\\omega & \\text{unbeliever}\n\\end{cases}";

  function noteContent(doc: ReturnType<typeof parseBody>): string {
    let content = "";
    JSON.stringify(doc, (_key, value) => {
      if (value?.type === "footnoteRef") content = value.attrs.content;
      return value;
    });
    return content;
  }

  it("writes inline math on one line so it survives a reload", () => {
    const editor = mount({
      extensions: createFootnoteExtensions(),
      content: "",
      contentType: "markdown",
    });
    editor.commands.insertContent([
      { type: "text", text: "Need is " },
      { type: "inlineMath", attrs: { latex: CASES } },
      { type: "text", text: " here." },
    ]);
    const markdown = editor.getMarkdown().trim();
    expect(markdown).not.toContain("\n");
    expect(markdown).not.toContain("\\\\mathrm");
    // Back through the essay pipeline: still one math node, same TeX tokens.
    const body = `Claim.[^1]\n\n[^1]: ${markdown}\n`;
    const content = noteContent(parseBody(serializeBody(parseBody(body))));
    const reopened = mount({
      extensions: createFootnoteExtensions(),
      content: prepareFootnoteMarkdown(content),
      contentType: "markdown",
    });
    const names = nodeNames(reopened);
    expect(names.filter((n) => n === "inlineMath")).toHaveLength(1);
    expect(reopened.getMarkdown().trim()).toBe(markdown);
    expect(footnoteHtml(content)).toContain("katex");
    expect(footnoteHtml(content)).not.toContain("katex-error");
    editor.destroy();
    reopened.destroy();
  });

  it("keeps display math in a footnote through save and reload", () => {
    const editor = mount({
      extensions: createFootnoteExtensions(),
      content: "",
      contentType: "markdown",
    });
    editor.commands.insertContent([
      { type: "paragraph", content: [{ type: "text", text: "The totalizing view:" }] },
      { type: "blockMath", attrs: { latex: CASES } },
    ]);
    const content = editor.getMarkdown().trim();
    // Put the note on the ref, then save and reload the essay twice.
    const essay = parseBody("Claim.[^1]\n\n[^1]: x\n");
    JSON.stringify(essay, (_k, v) => {
      if (v?.type === "footnoteRef") v.attrs.content = content;
      return v;
    });
    const once = serializeBody(essay);
    const twice = serializeBody(parseBody(once));
    expect(twice).toBe(once);
    const reloaded = noteContent(parseBody(twice));
    expect(reloaded).toBe(content);
    const reopened = mount({
      extensions: createFootnoteExtensions(),
      content: prepareFootnoteMarkdown(reloaded),
      contentType: "markdown",
    });
    let latex = "";
    reopened.state.doc.descendants((node) => {
      if (node.type.name === "blockMath") latex = node.attrs.latex;
    });
    expect(latex).toBe(CASES);
    const html = footnoteHtml(reloaded);
    expect(html).toContain("katex-display");
    expect(html).not.toContain("katex-error");
    editor.destroy();
    reopened.destroy();
  });

  it("drops % comments when joining inline lines", async () => {
    const { inlineLatexForMarkdown } = await import("@/lib/editor/math");
    expect(inlineLatexForMarkdown("a + b % note\n+ c")).toBe("a + b + c");
    expect(inlineLatexForMarkdown("50\\% \n off")).toBe("50\\% off");
    expect(inlineLatexForMarkdown("x^2")).toBe("x^2");
  });
});
