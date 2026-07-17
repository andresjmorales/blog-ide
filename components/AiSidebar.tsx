"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDialog } from "@/components/AppDialog";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { EditorOverflowMenu } from "@/components/EditorOverflowMenu";
import {
  chatCompletion,
  essayChatSystem,
  IMPORT_CLEANUP_SYSTEM,
  unwrapMarkdownReply,
} from "@/lib/ai/client";
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
  /** True when an essay is open (enables Include essay / Clean import). */
  essayAvailable?: boolean;
  /** Fresh markdown snapshot — called only on Send / Clean import. */
  getDocumentMarkdown?: () => string | null;
  onApplyMarkdown?: (markdown: string) => void;
  onOpenSettings?: () => void;
};

export function AiSidebar({
  essayAvailable = false,
  getDocumentMarkdown,
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
  /** On for the first attach in a thread; unchecked after a successful include. */
  const [includeEssay, setIncludeEssay] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const dialog = useAppDialog();

  const hasEssay = essayAvailable;

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

  function clearChat() {
    setMessages([]);
    setError(null);
    setIncludeEssay(true);
  }

  async function send(text: string, system?: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    const history: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(history);
    setInput("");

    const essayMarkdown =
      !system && includeEssay && hasEssay
        ? getDocumentMarkdown?.()?.trim() || null
        : null;
    const didIncludeEssay = Boolean(essayMarkdown);
    const essaySystem =
      system ??
      (didIncludeEssay && essayMarkdown
        ? essayChatSystem(essayMarkdown)
        : undefined);

    try {
      const reply = await chatCompletion({
        messages: history,
        system: essaySystem,
        provider: provider ?? undefined,
      });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
      if (didIncludeEssay) setIncludeEssay(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function cleanImport() {
    const documentMarkdown = getDocumentMarkdown?.()?.trim() || null;
    if (!documentMarkdown) {
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
      onApplyMarkdown?.(unwrapMarkdownReply(reply));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function applyReply(content: string) {
    if (!onApplyMarkdown) return;
    const markdown = unwrapMarkdownReply(content);
    if (!markdown) {
      setError("Nothing to apply.");
      return;
    }
    const ok = await dialog.confirm({
      title: "Replace essay?",
      message:
        "This will replace the open document with the assistant’s reply. You can undo with the editor if needed.",
      confirmLabel: "Apply",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    onApplyMarkdown(markdown);
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

  const settingsItems = [
    {
      id: "key",
      label: keyHint,
      disabled: true,
      onSelect: () => {},
    },
    ...(keys.importAssist
      ? [
          {
            id: "import-assist",
            label: "Import assist on",
            disabled: true,
            onSelect: () => {},
          },
        ]
      : []),
    {
      id: "clean",
      label: "Clean import",
      disabled: busy || !hasEssay,
      onSelect: () => {
        void cleanImport();
      },
    },
    {
      id: "keys",
      label: "API keys…",
      onSelect: () => onOpenSettings?.(),
    },
    ...(messages.length > 0
      ? [
          {
            id: "clear",
            label: "Clear chat",
            onSelect: clearChat,
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-medium">AI assistant</div>
        <EditorOverflowMenu items={settingsItems} />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-md px-2.5 py-2 text-xs leading-relaxed ${
              message.role === "user"
                ? "bg-accent/10 text-foreground"
                : "bg-panel text-foreground"
            }`}
          >
            {message.role === "assistant" ? (
              <ChatMarkdown markdown={message.content} />
            ) : (
              <div className="whitespace-pre-wrap">{message.content}</div>
            )}
            {message.role === "assistant" && onApplyMarkdown && (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void applyReply(message.content)}
                  className="rounded border border-border px-2 py-0.5 text-[0.7rem] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
                  title="Replace the open essay with this reply"
                >
                  Apply to essay
                </button>
              </div>
            )}
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
          placeholder={
            includeEssay && hasEssay
              ? "Ask about this essay…"
              : "Message the assistant…"
          }
          className="mb-2 w-full resize-none rounded border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-accent"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
        />
        <p className="mb-2 text-[0.7rem] leading-relaxed text-muted">
          Include essay attaches the open doc to this send (then turns off). Use{" "}
          <span className="text-foreground">Apply to essay</span> on a reply to
          replace the document. Clean import lives in ⋯.
        </p>
        <div className="flex items-center justify-between gap-3">
          <label
            className={`flex min-w-0 cursor-pointer items-center gap-1.5 text-xs ${
              !hasEssay ? "opacity-40" : "text-foreground"
            }`}
            title={
              hasEssay
                ? "Attach the open essay to the next message, then uncheck"
                : "Open an essay to attach it"
            }
          >
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={includeEssay && hasEssay}
              disabled={!hasEssay}
              onChange={(event) => setIncludeEssay(event.target.checked)}
            />
            Include essay
          </label>
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="shrink-0 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
