"use client";

import { useEffect, useMemo, useState } from "react";
import { generateHTML } from "@tiptap/core";
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

/**
 * The editor numbers footnotes with a node view; static HTML only has an
 * empty marker. Number them and list the notes under the reply.
 */
function numberFootnotes(html: string): string {
  if (!html.includes("footnote-ref") || typeof DOMParser === "undefined") {
    return html;
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;
  const notes: string[] = [];
  root.querySelectorAll("sup.footnote-ref").forEach((sup, index) => {
    const content = decodeFootnoteValue(sup.getAttribute("data-content") ?? "");
    sup.textContent = String(index + 1);
    notes.push(content.trim());
  });
  const items = notes
    .map((note) =>
      note
        ? `<li>${escapeHtml(note)}</li>`
        : `<li class="is-missing">(note not included in this reply)</li>`
    )
    .join("");
  return `${root.innerHTML}<ol class="ai-chat-notes">${items}</ol>`;
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
}: {
  markdown: string;
  /** Throttle re-rendering while the reply is still arriving. */
  streaming?: boolean;
}) {
  const source = useThrottled(markdown, STREAM_RENDER_MS, streaming);
  const html = useMemo(() => {
    try {
      const text = unwrapMarkdownReply(source);
      if (!text.trim()) return "";
      return numberFootnotes(generateHTML(parseBody(text), CHAT_EXTENSIONS));
    } catch {
      return null;
    }
  }, [source]);

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
