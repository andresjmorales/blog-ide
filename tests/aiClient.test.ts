import { describe, expect, it } from "vitest";
import {
  applySearchReplacePatches,
  applyTitleToMarkdown,
  extractTitleSuggestion,
  looksLikeFullMarkdownDocument,
  parseSearchReplacePatches,
  prepareApply,
} from "@/lib/ai/apply";
import { resolveModel } from "@/lib/ai/models";
import {
  essayChatSystem,
  selectionChatSystem,
  unwrapMarkdownReply,
} from "@/lib/ai/client";
import { actionUserPrompt } from "@/lib/ai/actions";

describe("unwrapMarkdownReply", () => {
  it("strips markdown fences", () => {
    expect(unwrapMarkdownReply("```markdown\n# Hi\n\nBody\n```")).toBe(
      "# Hi\n\nBody"
    );
  });

  it("returns plain text unchanged", () => {
    expect(unwrapMarkdownReply("Just a critique.")).toBe("Just a critique.");
  });
});

describe("essay and selection prompts", () => {
  it("embeds the essay and explains footnotes", () => {
    const system = essayChatSystem(
      "---\ntitle: Test\n---\n\nHello[^1].\n\n[^1]: A note."
    );
    expect(system).toContain("title: Test");
    expect(system).toContain("Hello[^1].");
    expect(system).toContain("[^1]:");
    expect(system).toMatch(/not as continuation of the main argument/i);
    expect(system).toContain("<<<SEARCH");
  });

  it("scopes selection rewrites to the passage", () => {
    const system = selectionChatSystem({
      selectionMarkdown: "a thin sentence",
      essayMarkdown: "# Essay\n\na thin sentence\n",
    });
    expect(system).toContain("a thin sentence");
    expect(system).toContain("Full essay");
    expect(system).toMatch(/ONLY the revised passage/i);
  });
});

describe("canned action prompts", () => {
  it("asks for TITLE line on title action", () => {
    expect(actionUserPrompt("title", "essay")).toContain("TITLE:");
  });

  it("asks for passage-only tighten on selection", () => {
    expect(actionUserPrompt("tighten", "selection")).toMatch(
      /ONLY the revised passage/i
    );
  });
});

describe("model allowlist", () => {
  it("falls back to provider default for unknown ids", () => {
    expect(resolveModel("anthropic", "nope")).toBe("claude-sonnet-4-6");
    expect(resolveModel("openai", null)).toBe("gpt-4o-mini");
  });
});

describe("smarter apply", () => {
  const essay = `---
title: Old
---

First paragraph.

Second paragraph with a marker[^1].

[^1]: Note.
`;

  it("parses and applies search/replace patches", () => {
    const reply = `<<<SEARCH
First paragraph.
===
First paragraph, revised.
>>>REPLACE`;
    const patches = parseSearchReplacePatches(reply);
    expect(patches).toHaveLength(1);
    const result = applySearchReplacePatches(essay, patches!);
    expect(result.applied).toBe(1);
    expect(result.markdown).toContain("First paragraph, revised.");
  });

  it("applies TITLE suggestions into frontmatter", () => {
    expect(extractTitleSuggestion("1. A\n2. B\n\nTITLE: Better Title")).toBe(
      "Better Title"
    );
    const next = applyTitleToMarkdown(essay, "Better Title");
    expect(next).toContain("title: Better Title");
    expect(next).toContain("First paragraph.");
  });

  it("prepares selection replaces", () => {
    const prepared = prepareApply({
      reply: "First paragraph, tighter.",
      essayMarkdown: essay,
      selectionText: "First paragraph.",
      scope: "selection",
    });
    expect(prepared.kind).toBe("selection");
    if (prepared.kind === "selection") {
      expect(prepared.after).toBe("First paragraph, tighter.");
    }
  });

  it("detects full document rewrites", () => {
    expect(
      looksLikeFullMarkdownDocument(
        "---\ntitle: X\n---\n\n# Head\n\nBody paragraph one.\n\nBody paragraph two.\n"
      )
    ).toBe(true);
    expect(looksLikeFullMarkdownDocument("Nice critique.")).toBe(false);
  });

  it("prefers patches over full replace when present", () => {
    const prepared = prepareApply({
      reply: `<<<SEARCH
First paragraph.
===
Patched.
>>>REPLACE`,
      essayMarkdown: essay,
      selectionText: null,
      scope: "essay",
    });
    expect(prepared.kind).toBe("patches");
    if (prepared.kind === "patches") {
      expect(prepared.after).toContain("Patched.");
      expect(prepared.applied).toBe(1);
    }
  });
});
