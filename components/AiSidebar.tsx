"use client";

import { useEffect, useRef, useState } from "react";
import { chatCompletion, IMPORT_CLEANUP_SYSTEM } from "@/lib/ai/client";
import {
  getActiveProvider,
  loadAiKeys,
  maskKey,
  type AiKeys,
  type AiProvider,
} from "@/lib/ai/keys";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  /** Current essay markdown for cleanup / context actions. */
  documentMarkdown?: string | null;
  onApplyMarkdown?: (markdown: string) => void;
  onOpenSettings?: () => void;
};

export function AiSidebar({
  documentMarkdown,
  onApplyMarkdown,
  onOpenSettings,
}: Props) {
  // Always start empty so SSR and the first client paint match; load keys after mount.
  const [keys, setKeys] = useState<AiKeys>({});
  const [keysReady, setKeysReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    function refresh() {
      setKeys(loadAiKeys());
      setKeysReady(true);
    }
    refresh();
    window.addEventListener("blogide-ai-keys", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("blogide-ai-keys", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const provider = getActiveProvider(keys);
  const keyHint = provider
    ? `${provider === "anthropic" ? "Anthropic" : "OpenAI"} · ${maskKey(
        provider === "anthropic" ? keys.anthropic : keys.openai
      )}`
    : "No API key";

  async function send(text: string, system?: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    const history: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(history);
    setInput("");
    try {
      const reply = await chatCompletion({
        messages: history,
        system,
        provider: provider ?? undefined,
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cleanImport() {
    if (!documentMarkdown?.trim()) {
      setError("Open an essay first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const reply = await chatCompletion({
        messages: [
          {
            role: "user",
            content: `Clean up this pasted essay for BlogIDE:\n\n${documentMarkdown}`,
          },
        ],
        system: IMPORT_CLEANUP_SYSTEM,
        provider: (provider ?? "anthropic") as AiProvider,
      });
      setMessages((current) => [
        ...current,
        {
          role: "user",
          content: "Clean up this pasted essay (footnotes, headings, quotes).",
        },
        { role: "assistant", content: reply },
      ]);
      onApplyMarkdown?.(reply.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!keysReady) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 text-sm text-muted">
        <p>Loading assistant…</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 text-sm text-muted">
        <p>
          Add your own Anthropic or OpenAI API key to use the assistant. Keys
          stay in this browser and are only sent to the provider when you chat.
        </p>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
          onClick={onOpenSettings}
        >
          Open Account settings
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="border-b border-border px-3 py-2 text-[0.7rem] text-muted">
        {keyHint}
        {keys.importAssist ? " · Import assist on" : ""}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
        <button
          type="button"
          disabled={busy || !documentMarkdown}
          onClick={() => void cleanImport()}
          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:border-accent hover:text-accent disabled:opacity-40"
          title="Rewrite pasted Substack/Docs footnotes and formatting into BlogIDE markdown"
        >
          Clean import
        </button>
        <button
          type="button"
          className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
          onClick={onOpenSettings}
        >
          Keys…
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="text-xs leading-relaxed text-muted">
            Ask for critique, tighter wording, or title ideas. Use{" "}
            <strong className="font-medium text-foreground">Clean import</strong>{" "}
            after pasting from Substack or Docs when footnotes arrive as plain
            links.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-md px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              message.role === "user"
                ? "bg-accent/10 text-foreground"
                : "bg-panel text-foreground"
            }`}
          >
            {message.content}
          </div>
        ))}
        {busy && <p className="text-xs text-muted">Thinking…</p>}
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder="Message the assistant…"
          className="mb-2 w-full resize-none rounded border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-accent"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
