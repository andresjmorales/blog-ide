"use client";

import { useMemo } from "react";
import { generateHTML } from "@tiptap/core";
import { unwrapMarkdownReply } from "@/lib/ai/client";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

const CHAT_EXTENSIONS = createExtensions();

/** Render assistant markdown with the same TipTap schema as the editor. */
export function ChatMarkdown({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    try {
      const source = unwrapMarkdownReply(markdown);
      if (!source.trim()) return "";
      return generateHTML(parseBody(source), CHAT_EXTENSIONS);
    } catch {
      return null;
    }
  }, [markdown]);

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
