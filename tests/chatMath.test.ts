import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/core";
import { renderChatMath } from "@/lib/ai/chatMath";
import { normalizeLatexDelimiters } from "@/lib/editor/math";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

function render(markdown: string): HTMLElement {
  const html = generateHTML(
    parseBody(normalizeLatexDelimiters(markdown)),
    createExtensions()
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  renderChatMath(root);
  return root;
}

describe("normalizeLatexDelimiters", () => {
  it("rewrites LaTeX delimiters to dollar forms", () => {
    expect(normalizeLatexDelimiters("a \\(x^2\\) b")).toBe("a $x^2$ b");
    expect(normalizeLatexDelimiters("\\[ E = mc^2 \\]")).toBe("\n$$E = mc^2$$\n");
  });

  it("leaves code alone", () => {
    const code = "`\\(x\\)` and\n```\n\\[y\\]\n```";
    expect(normalizeLatexDelimiters(code)).toBe(code);
  });
});

describe("renderChatMath", () => {
  it("fills inline and block math with KaTeX", () => {
    const root = render("Inline $x^2$ here.\n\n$$\\frac{a}{b}$$");
    expect(root.querySelector("[data-inline-math] .katex")).not.toBeNull();
    expect(root.querySelector("[data-block-math] .katex-display")).not.toBeNull();
  });

  it("renders \\( \\) and \\[ \\] delimiters", () => {
    const root = render("Inline \\(a+b\\).\n\n\\[\\sum_i x_i\\]");
    expect(root.querySelector("[data-inline-math] .katex")).not.toBeNull();
    expect(root.querySelector("[data-block-math] .katex")).not.toBeNull();
  });
});
