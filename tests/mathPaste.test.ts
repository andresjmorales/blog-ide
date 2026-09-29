import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { takeMathAutoOpen } from "@/lib/editor/math";
import { convertPastedMathHtml } from "@/lib/editor/mathPaste";

describe("convertPastedMathHtml", () => {
  it("turns delimited math in text into math nodes", () => {
    const out = convertPastedMathHtml("<p>Area $a^2$ and \\(b\\) cost $5 and $10.</p>");
    expect(out).toContain('data-inline-math="" data-latex="a^2"');
    expect(out).toContain('data-latex="b"');
    expect(out).toContain("cost $5 and $10.");
  });

  it("lifts display math out of its paragraph", () => {
    const out = convertPastedMathHtml("<p>Before $$x_1$$ after</p><p>$$y$$</p>");
    expect(out).toBe(
      '<p>Before </p><div data-block-math="" data-latex="x_1"></div><p> after</p>' +
        '<div data-block-math="" data-latex="y"></div>'
    );
  });

  it("uses the TeX source of rendered KaTeX / MathML", () => {
    const katex =
      '<p>See <span class="katex"><span class="katex-mathml"><math><semantics><mi>z</mi>' +
      '<annotation encoding="application/x-tex">z_1</annotation></semantics></math></span>' +
      '<span class="katex-html">z1</span></span>.</p>';
    expect(convertPastedMathHtml(katex)).toBe(
      '<p>See <span data-inline-math="" data-latex="z_1"></span>.</p>'
    );
  });

  it("leaves code alone", () => {
    const html = "<pre><code>$x$ \\(y\\)</code></pre><p><code>$z$</code></p>";
    expect(convertPastedMathHtml(html)).toBe(html);
  });
});

describe("math insert commands", () => {
  it("flag the inserted node to open its LaTeX editor", () => {
    const editor = new Editor({ extensions: createExtensions() });
    editor.commands.insertInlineMath("x");
    let math: object | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "inlineMath") math = node;
    });
    expect(math).not.toBeNull();
    expect(takeMathAutoOpen(math!)).toBe(true);
    editor.destroy();
  });
});
