"use client";

import { useEffect, useMemo, useState } from "react";
import { generateHTML } from "@tiptap/core";
import { normalizeChatMathDelimiters, renderChatMath } from "@/lib/ai/chatMath";
import { unwrapMarkdownReply } from "@/lib/ai/client";
import { decodeFootnoteValue } from "@/lib/editor/footnote";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

const CHAT_EXTENSIONS = createExtensions();

/** Re-parse streaming text at most this often (each parse is the whole reply). */
const STREAM_RENDER_MS = 250;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** `[^label]` from a parsed marker id (`source-<encoded label>-<occurrence>`). */
function labelFromId(id: string): string | null {
  const match = id.match(/^source-(.+)-\d+$/);
  return match ? decodeFootnoteValue(match[1]) : null;
}

/**
 * The editor numbers footnotes with a node view; static HTML only has an
 * empty marker. Show each marker's own label (so "[^3]" reads as the essay's
 * note 3) and list the notes under the reply. Notes the reply only cites
 * come from the essay the model was given.
 */
function numberFootnotes(
  root: Element,
  essayNotes: Record<string, string> | undefined
): void {
  if (!root.querySelector("sup.footnote-ref")) return;
  const items: string[] = [];
  const listed = new Set<string>();
  root.querySelectorAll("sup.footnote-ref").forEach((sup, index) => {
    const label = labelFromId(sup.getAttribute("data-id") ?? "") ?? String(index + 1);
    sup.textContent = label;
    if (listed.has(label)) return;
    listed.add(label);
    const own = decodeFootnoteValue(sup.getAttribute("data-content") ?? "").trim();
    const fromEssay = essayNotes?.[label]?.trim();
    const marker = `<sup>${escapeHtml(label)}</sup> `;
    if (own) items.push(`<li>${marker}${escapeHtml(own)}</li>`);
    else if (fromEssay) {
      items.push(
        `<li class="is-essay" title="Note from the essay">${marker}${escapeHtml(fromEssay)}</li>`
      );
    } else {
      items.push(`<li class="is-missing">${marker}(note not found)</li>`);
    }
  });
  root.insertAdjacentHTML("beforeend", `<ul class="ai-chat-notes">${items.join("")}</ul>`);
}

/** Fill in what static HTML leaves empty: math and footnote numbers. */
function finishHtml(html: string, essayNotes: Record<string, string> | undefined): string {
  const needsMath = html.includes("data-inline-math") || html.includes("data-block-math");
  const needsNotes = html.includes("footnote-ref");
  if ((!needsMath && !needsNotes) || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;
  if (needsMath) renderChatMath(root);
  if (needsNotes) numberFootnotes(root, essayNotes);
  return root.innerHTML;
}

/** Latest value, but updated at most every `ms` while `active`. */
function useThrottled<T>(value: T, ms: number, active: boolean): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    // When not streaming the live value is returned directly below.
    if (!active) return;
    const timer = window.setTimeout(() => setShown(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms, active]);
  return active ? shown : value;
}

/** Render assistant markdown with the same TipTap schema as the editor. */
export function ChatMarkdown({
  markdown,
  streaming = false,
  notes,
}: {
  markdown: string;
  /** Throttle re-rendering while the reply is still arriving. */
  streaming?: boolean;
  /** Essay footnotes by label, for markers whose note isn't in the reply. */
  notes?: Record<string, string>;
}) {
  const source = useThrottled(markdown, STREAM_RENDER_MS, streaming);
  const html = useMemo(() => {
    try {
      const text = normalizeChatMathDelimiters(unwrapMarkdownReply(source));
      if (!text.trim()) return "";
      return finishHtml(generateHTML(parseBody(text), CHAT_EXTENSIONS), notes);
    } catch {
      return null;
    }
  }, [source, notes]);

  if (html === null) {
    return <div className="whitespace-pre-wrap">{markdown}</div>;
  }

  return (
    <div
      className="ai-chat-prose editor-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
