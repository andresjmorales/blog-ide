import {
  getActiveProvider,
  loadAiKeys,
  type AiProvider,
} from "@/lib/ai/keys";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function chatCompletion(input: {
  messages: ChatMessage[];
  system?: string;
  provider?: AiProvider;
}): Promise<string> {
  const keys = loadAiKeys();
  const provider = input.provider ?? getActiveProvider(keys);
  if (!provider) {
    throw new Error("Add an Anthropic or OpenAI API key in Account settings.");
  }
  const apiKey = provider === "anthropic" ? keys.anthropic : keys.openai;
  if (!apiKey) {
    throw new Error(`No ${provider} API key saved.`);
  }

  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      provider,
      messages: input.messages,
      system: input.system,
    }),
  });

  const payload = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "AI request failed.");
  }
  return payload.text ?? "";
}

export const IMPORT_CLEANUP_SYSTEM = `You clean up essays pasted into BlogIDE from Substack, Google Docs, or Word.

Return ONLY the full cleaned markdown document (including any YAML frontmatter if present). No preamble.

Rules:
- Convert footnote hyperlinks like [1](#footnote-1) or similar into GFM footnotes: body uses [^1] and definitions use [^1]: note text at the end.
- If the doc already has [^1] in the prose AND a trailing block of bare [^1] / [^2] lines each followed by note paragraphs, MERGE those paragraphs into [^n]: definitions and DELETE the bare trailing markers. Do not create a second set of footnotes.
- Preserve footnote wording; do not invent notes.
- Normalize headings to ATX (# ## ### ####). The essay title belongs in frontmatter title:, not as a body Heading 1.
- Turn indented quote-looking paragraphs into markdown blockquotes (> ).
- Remove leftover footnote navigation chrome ("Jump to footnote", back-ref arrows, etc.).
- Keep the author's prose otherwise unchanged.`;

/** System prompt when the open essay is attached as chat context. */
export function essayChatSystem(essayMarkdown: string): string {
  return `You are helping revise a BlogIDE essay (markdown with optional YAML frontmatter).

Footnotes (important — do not confuse with body prose):
- BlogIDE uses GFM footnote syntax. In the body, a citation is only a short marker like [^1] or [^2] (inline, usually after a word/sentence). That marker is NOT the note text.
- The note text lives in definitions at the end of the document, one per line (or block), like:
  [^1]: This is the footnote content.
  [^2]: Another note.
- When reading or critiquing the essay, treat definition lines as asides / endnotes, not as continuation of the main argument. Do not summarize or quote footnote definitions as if they were body paragraphs unless the user asked about the notes.
- When rewriting the full document, keep markers in the body and matching [^n]: definitions at the end; preserve ids and wording unless the user asked to change the notes. Do not inline footnote text into the main essay.

The user can apply a full revised document back into the editor. When they ask you to rewrite, edit, or return the essay:
- Return ONLY the complete markdown document (keep frontmatter if present). No preamble or code fences.
- Otherwise (critique, ideas, questions): answer normally in prose; do not dump the whole essay unless asked.

Current essay:
---
${essayMarkdown}
---`;
}

/** Strip optional \`\`\`markdown fences from a model reply before Apply. */
export function unwrapMarkdownReply(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
