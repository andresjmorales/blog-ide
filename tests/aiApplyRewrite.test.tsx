import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import {
  footnoteNotes,
  normalizeFullDocumentReply,
  prepareApply,
  restoreFootnoteDefinitions,
  stripReplyPreface,
  withoutFootnoteDefinitions,
} from "@/lib/ai/apply";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { unifiedLineDiff } from "@/lib/markdown/diff";

const essay = `---
title: My Essay
---

Opening paragraph that sets things up for the reader.

A claim that needs support.[^1] And another claim.[^2]

Closing paragraph with a final thought for everyone.

[^1]: First note, with a source.
[^2]: Second note.
`;

describe("whole-essay rewrites", () => {
  it("treats a rewrite with the same frontmatter title as a document, not a title", () => {
    const reply = essay.replace("sets things up", "frames the question");
    const prepared = prepareApply({
      reply,
      essayMarkdown: essay,
      selectionText: null,
      scope: "essay",
    });
    expect(prepared.kind).toBe("document");
    if (prepared.kind === "document") {
      expect(prepared.after).toContain("frames the question");
    }
  });

  it("accepts a body-only rewrite and keeps frontmatter and dropped notes", () => {
    const reply = `Here is the revised essay:

Opening paragraph that frames the reader's question.

A claim that needs support.[^1] And another claim.[^2]

Closing paragraph with a sharper final thought.`;
    const prepared = prepareApply({
      reply,
      essayMarkdown: essay,
      selectionText: null,
      scope: "essay",
    });
    expect(prepared.kind).toBe("document");
    if (prepared.kind === "document") {
      expect(prepared.after.startsWith("---\ntitle: My Essay\n---\n")).toBe(true);
      expect(prepared.after).not.toContain("Here is the revised essay");
      expect(prepared.after).toContain("[^1]: First note, with a source.");
      expect(prepared.after).toContain("[^2]: Second note.");
    }
  });

  it("keeps BlogIDE trailers the model left out", () => {
    const withTrailer = `${essay}\n<!--blogide-citations:[]-->\n`;
    const next = normalizeFullDocumentReply("---\ntitle: X\n---\n\nBody.", withTrailer);
    expect(next.trimEnd().endsWith("<!--blogide-citations:[]-->")).toBe(true);
  });

  it("still reads an explicit TITLE line", () => {
    const prepared = prepareApply({
      reply: "1. A\n2. B\n\nTITLE: A Better Title",
      essayMarkdown: essay,
      selectionText: null,
      scope: "essay",
    });
    expect(prepared.kind).toBe("title");
  });
});

describe("footnotes in selection rewrites", () => {
  const selection = "A claim that needs support.[^1]\n\n[^1]: First note, with a source.";

  it("restores definitions a rewrite dropped", () => {
    const prepared = prepareApply({
      reply: "A claim, now supported.[^1]",
      essayMarkdown: essay,
      selectionText: selection,
      scope: "selection",
    });
    expect(prepared.kind).toBe("selection");
    if (prepared.kind === "selection") {
      expect(prepared.after).toContain("[^1]: First note, with a source.");
    }
  });

  it("leaves definitions the rewrite kept (or changed) alone", () => {
    const reply = "Claim.[^1]\n\n[^1]: Edited note.";
    expect(restoreFootnoteDefinitions(reply, selection)).toBe(reply);
  });

  it("strips definitions for markdown-level replacement", () => {
    expect(withoutFootnoteDefinitions(selection)).toBe(
      "A claim that needs support.[^1]"
    );
  });

  it("drops a one-line preface only before a substantial passage", () => {
    expect(stripReplyPreface("Sure:\n\nShort.")).toBe("Sure:\n\nShort.");
    const long = "x".repeat(250);
    expect(stripReplyPreface(`Revised:\n\n${long}`)).toBe(long);
  });
});

describe("chat footnotes", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  function render(node: React.ReactNode) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(node));
    return host;
  }

  it("labels markers and lists notes instead of showing ?", () => {
    const el = render(
      <ChatMarkdown markdown={"Claim.[^1] Other.[^2]\n\n[^1]: The note."} />
    );
    const sups = [...el.querySelectorAll("sup.footnote-ref")].map((s) => s.textContent);
    expect(sups).toEqual(["1", "2"]);
    const notes = el.querySelectorAll(".ai-chat-notes li");
    expect(notes[0]?.textContent).toBe("1 The note.");
    expect(notes[1]?.className).toBe("is-missing");
  });

  it("fills cited notes from the essay, keeping the essay's numbers", () => {
    const el = render(
      <ChatMarkdown
        markdown={"Your third point.[^3]"}
        notes={footnoteNotes("Body.[^3]\n\n[^3]: Essay note three.\n")}
      />
    );
    expect(el.querySelector("sup.footnote-ref")?.textContent).toBe("3");
    const note = el.querySelector(".ai-chat-notes li");
    expect(note?.className).toBe("is-essay");
    expect(note?.textContent).toBe("3 Essay note three.");
  });
});

describe("line diff on long essays", () => {
  it("handles a large rewrite quickly and keeps shared head/tail as context", () => {
    const a = Array.from({ length: 6000 }, (_, i) => `line ${i}`).join("\n");
    const b = Array.from({ length: 6000 }, (_, i) => `changed ${i}`).join("\n");
    const started = Date.now();
    const lines = unifiedLineDiff(`head\n${a}\ntail`, `head\n${b}\ntail`);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(lines[0]).toEqual({ type: "context", text: "head" });
    expect(lines.at(-1)).toEqual({ type: "context", text: "tail" });
  });
});
