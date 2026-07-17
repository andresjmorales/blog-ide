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
