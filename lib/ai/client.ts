import {
  getActiveProvider,
  loadAiKeys,
  type AiProvider,
} from "@/lib/ai/keys";
import {
  defaultModelForProvider,
  resolveModel,
} from "@/lib/ai/models";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatCompletionInput = {
  messages: ChatMessage[];
  system?: string;
  provider?: AiProvider;
  model?: string;
  /** Abort in-flight stream / request. */
  signal?: AbortSignal;
};

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || "AI request failed.";
  } catch {
    return "AI request failed.";
  }
}

function resolveRequest(input: ChatCompletionInput): {
  provider: AiProvider;
  apiKey: string;
  model: string;
} {
  const keys = loadAiKeys();
  const provider = input.provider ?? getActiveProvider(keys);
  if (!provider) {
    throw new Error("Add an Anthropic or OpenAI API key in Settings.");
  }
  const apiKey = provider === "anthropic" ? keys.anthropic : keys.openai;
  if (!apiKey) {
    throw new Error(`No ${provider} API key saved.`);
  }
  const preferred =
    input.model ??
    (provider === "anthropic" ? keys.anthropicModel : keys.openaiModel);
  const model = resolveModel(provider, preferred);
  return { provider, apiKey, model };
}

export async function chatCompletion(
  input: ChatCompletionInput
): Promise<string> {
  const { provider, apiKey, model } = resolveRequest(input);

  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    signal: input.signal,
    body: JSON.stringify({
      provider,
      model,
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

/**
 * Stream a chat completion. Calls `onDelta` with each text chunk.
 * Returns the full assistant text.
 */
export async function chatCompletionStream(
  input: ChatCompletionInput & { onDelta: (chunk: string) => void }
): Promise<string> {
  const { provider, apiKey, model } = resolveRequest(input);

  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      accept: "text/event-stream",
    },
    signal: input.signal,
    body: JSON.stringify({
      provider,
      model,
      messages: input.messages,
      system: input.system,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  // Non-stream fallback (proxy or middleware downgraded the response).
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const payload = (await response.json()) as { text?: string; error?: string };
    if (payload.error) throw new Error(payload.error);
    const text = payload.text ?? "";
    if (text) input.onDelta(text);
    return text;
  }

  if (!response.body) {
    throw new Error("No response stream from AI proxy.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          text?: string;
          error?: string;
        };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) {
          full += parsed.text;
          input.onDelta(parsed.text);
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }

  return full;
}

export { defaultModelForProvider, resolveModel };

export const IMPORT_CLEANUP_SYSTEM = `You clean up essays pasted into BlogIDE from Substack, Google Docs, Word, or similar.

Return ONLY the full cleaned markdown document (including any YAML frontmatter if present). No preamble, no code fences, no commentary.

Essay-aware rules:
- This is an essay or long-form post, not a chat transcript. Preserve the author's argument, voice, emphasis, and structure.
- Convert footnote hyperlinks like [1](#footnote-1) or similar into GFM footnotes: body uses [^1] and definitions use [^1]: note text at the end.
- If the doc already has [^1] in the prose AND a trailing block of bare [^1] / [^2] lines each followed by note paragraphs, MERGE those paragraphs into [^n]: definitions and DELETE the bare trailing markers. Do not create a second set of footnotes.
- Preserve footnote wording; do not invent notes or citations.
- Do not add or invent <!--blogide-citations:…--> trailers. Those are BlogIDE-only snapshots written by the Cite rail.
- Normalize headings to ATX (# ## ### ####). The essay title belongs in frontmatter title:, not as a body Heading 1. Do not invent a title if none exists.
- Turn indented quote-looking paragraphs into markdown blockquotes (> ).
- Remove leftover footnote navigation chrome ("Jump to footnote", back-ref arrows, "Share", subscribe CTAs, like counts, author bio footers that are clearly platform chrome).
- Fix obvious paste glitches (doubled spaces, broken line wraps mid-sentence) only when clearly accidental.
- Keep the author's prose otherwise unchanged. Do not "improve" wording during import cleanup.`;

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
- If a <!--blogide-citations:…--> comment is present, leave it unchanged. Do not invent citation snapshots.

Apply / rewrite protocol:
- When the user asks you to rewrite, edit, tighten, or expand the whole essay: return ONLY the complete markdown document (keep frontmatter if present). No preamble or code fences.
- For small surgical edits you may instead return one or more patch blocks:
  <<<SEARCH
  exact text from the essay
  ===
  replacement text
  >>>REPLACE
- Otherwise (critique, ideas, questions): answer normally in prose; do not dump the whole essay unless asked.

Current essay:
---
${essayMarkdown}
---`;
}

/** System prompt when only a selection is the rewrite target. */
export function selectionChatSystem(input: {
  selectionMarkdown: string;
  essayMarkdown?: string | null;
}): string {
  const essayBlock = input.essayMarkdown
    ? `\n\nFull essay (for context only — do not rewrite unless asked):\n---\n${input.essayMarkdown}\n---`
    : "";

  return `You are helping revise a selected passage inside a BlogIDE essay (markdown, GFM footnotes).

Selection rules:
- The user selected a passage. When they ask to rewrite, tighten, or expand, return ONLY the revised passage as markdown — no preamble, no code fences, no surrounding essay.
- Preserve footnote markers like [^1] inside the selection. Do not invent notes.
- Match the author's voice and register.
- For critique / questions: answer in prose; do not dump a rewrite unless asked.

Selected passage:
---
${input.selectionMarkdown}
---${essayBlock}`;
}

/** Strip optional \`\`\`markdown fences from a model reply before Apply. */
export function unwrapMarkdownReply(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}
