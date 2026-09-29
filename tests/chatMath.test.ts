import { describe, expect, it } from "vitest";
import { generateHTML } from "@tiptap/core";
import { normalizeChatMathDelimiters, renderChatMath } from "@/lib/ai/chatMath";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

function render(markdown: string): HTMLElement {
  const html = generateHTML(
    parseBody(normalizeChatMathDelimiters(markdown)),
    createExtensions()
  );
  const root = document.createElement("div");
  root.innerHTML = html;
  renderChatMath(root);
  return root;
}

describe("normalizeChatMathDelimiters", () => {
  it("rewrites LaTeX delimiters to dollar forms", () => {
    expect(normalizeChatMathDelimiters("a \\(x^2\\) b")).toBe("a $x^2$ b");
    expect(normalizeChatMathDelimiters("\\[ E = mc^2 \\]")).toBe("\n$$E = mc^2$$\n");
  });

  it("leaves code alone", () => {
    const code = "`\\(x\\)` and\n```\n\\[y\\]\n```";
    expect(normalizeChatMathDelimiters(code)).toBe(code);
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
