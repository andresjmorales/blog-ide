"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { EditorOverflowMenu } from "@/components/EditorOverflowMenu";
import {
  AI_ACTIONS,
  actionSystemAddon,
  actionUserPrompt,
  type AiActionId,
} from "@/lib/ai/actions";
import {
  applyDiffPreview,
  prepareApply,
  type PreparedApply,
} from "@/lib/ai/apply";
import {
  chatCompletion,
  chatCompletionStream,
  essayChatSystem,
  IMPORT_CLEANUP_SYSTEM,
  selectionChatSystem,
  unwrapMarkdownReply,
} from "@/lib/ai/client";
import {
  getActiveProvider,
  loadAiKeys,
  saveAiKeys,
  maskKey,
  type AiKeys,
  type AiProvider,
} from "@/lib/ai/keys";
import { modelsForProvider, resolveModel } from "@/lib/ai/models";
import type { AiSelection } from "@/lib/ai/selection";

type Message = {
  role: "user" | "assistant";
  content: string;
  /** Scope used when generating this assistant turn (for Apply). */
  scope?: "essay" | "selection";
  selectionText?: string;
};

type Props = {
  /** True when an essay is open (enables Include essay / Clean import). */
  essayAvailable?: boolean;
  /** Fresh markdown snapshot — called only on Send / Clean import. */
  getDocumentMarkdown?: () => string | null;
  /** Current editor selection, if any. */
  getSelection?: () => AiSelection | null;
  onApplyMarkdown?: (markdown: string) => void;
  onApplySelection?: (markdown: string, selection: AiSelection) => boolean;
  onOpenSettings?: () => void;
};

export function AiSidebar({
  essayAvailable = false,
  getDocumentMarkdown,
  getSelection,
  onApplyMarkdown,
  onApplySelection,
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
  /** Prefer selection as context when the editor has one. */
  const [preferSelection, setPreferSelection] = useState(true);
  const [pendingApply, setPendingApply] = useState<{
    messageIndex: number;
    prepared: PreparedApply & { kind: Exclude<PreparedApply["kind"], "none"> };
    selection: AiSelection | null;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasEssay = essayAvailable;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, pendingApply]);

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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const provider = getActiveProvider(keys);
  const modelId = provider
    ? resolveModel(
        provider,
        provider === "anthropic" ? keys.anthropicModel : keys.openaiModel
      )
    : null;
  const modelOptions = provider ? modelsForProvider(provider) : [];
  const keyHint = provider
    ? `${provider === "anthropic" ? "Anthropic" : "OpenAI"} · ${maskKey(
        provider === "anthropic" ? keys.anthropic : keys.openai
      )}`
    : "No API key";

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setIncludeEssay(true);
    setPendingApply(null);
  }

  function setModel(nextModel: string) {
    if (!provider) return;
    const patch: AiKeys =
      provider === "anthropic"
        ? { anthropicModel: nextModel }
        : { openaiModel: nextModel };
    setKeys(saveAiKeys(patch));
  }

  function resolveScope(actionPreferSelection?: boolean): {
    scope: "essay" | "selection";
    selection: AiSelection | null;
    essayMarkdown: string | null;
  } {
    const essayMarkdown = getDocumentMarkdown?.()?.trim() || null;
    const selection = getSelection?.() ?? null;
    const wantSelection =
      (actionPreferSelection ?? preferSelection) && Boolean(selection?.text);
    if (wantSelection && selection) {
      return { scope: "selection", selection, essayMarkdown };
    }
    return { scope: "essay", selection: null, essayMarkdown };
  }

  function buildSystem(input: {
    scope: "essay" | "selection";
    selection: AiSelection | null;
    essayMarkdown: string | null;
    includeEssay: boolean;
    actionId?: AiActionId;
    forcedSystem?: string;
  }): string | undefined {
    if (input.forcedSystem) return input.forcedSystem;
    const addon = input.actionId ? `\n\n${actionSystemAddon(input.actionId)}` : "";
    if (input.scope === "selection" && input.selection) {
      return (
        selectionChatSystem({
          selectionMarkdown: input.selection.text,
          essayMarkdown: input.includeEssay ? input.essayMarkdown : null,
        }) + addon
      );
    }
    if (input.includeEssay && input.essayMarkdown) {
      return essayChatSystem(input.essayMarkdown) + addon;
    }
    if (input.actionId) return actionSystemAddon(input.actionId);
    return undefined;
  }

  async function runChat(opts: {
    userText: string;
    actionId?: AiActionId;
    forcedSystem?: string;
    forceIncludeEssay?: boolean;
    forceScope?: "essay" | "selection";
  }) {
    const trimmed = opts.userText.trim();
    if (!trimmed || busy) return;
    setError(null);
    setPendingApply(null);
    setBusy(true);

    const action = opts.actionId
      ? AI_ACTIONS.find((a) => a.id === opts.actionId)
      : undefined;
    const resolved = resolveScope(
      opts.forceScope === "selection"
        ? true
        : opts.forceScope === "essay"
          ? false
          : action?.preferSelection
    );
    const scope =
      opts.forceScope ??
      (resolved.scope === "selection" ? "selection" : "essay");
    const selection = scope === "selection" ? resolved.selection : null;
    const shouldIncludeEssay =
      opts.forceIncludeEssay ??
      (scope === "selection" ? true : includeEssay && hasEssay);

    const history: Message[] = [
      ...messages,
      {
        role: "user",
        content: trimmed,
        scope,
        selectionText: selection?.text,
      },
    ];
    setMessages(history);
    setInput("");

    const system = buildSystem({
      scope,
      selection,
      essayMarkdown: resolved.essayMarkdown,
      includeEssay: shouldIncludeEssay && hasEssay,
      actionId: opts.actionId,
      forcedSystem: opts.forcedSystem,
    });

    const assistantIndex = history.length;
    setMessages([...history, { role: "assistant", content: "", scope, selectionText: selection?.text }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reply = await chatCompletionStream({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        system,
        provider: provider ?? undefined,
        model: modelId ?? undefined,
        signal: controller.signal,
        onDelta: (chunk) => {
          setMessages((current) => {
            const next = [...current];
            const existing = next[assistantIndex];
            if (!existing || existing.role !== "assistant") return current;
            next[assistantIndex] = {
              ...existing,
              content: existing.content + chunk,
            };
            return next;
          });
        },
      });
      setMessages((current) => {
        const next = [...current];
        const existing = next[assistantIndex];
        if (!existing || existing.role !== "assistant") return current;
        next[assistantIndex] = {
          ...existing,
          content: reply || existing.content,
          scope,
          selectionText: selection?.text,
        };
        return next;
      });
      if (shouldIncludeEssay && scope === "essay") setIncludeEssay(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((current) =>
          current.filter(
            (m, i) => !(i === assistantIndex && m.role === "assistant" && !m.content)
          )
        );
      } else {
        setError(err instanceof Error ? err.message : "Request failed.");
        setMessages((current) =>
          current.filter(
            (m, i) => !(i === assistantIndex && m.role === "assistant" && !m.content.trim())
          )
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function send(text: string) {
    await runChat({ userText: text });
  }

  async function runAction(actionId: AiActionId) {
    if (!hasEssay && actionId !== "critique") {
      setError("Open an essay first.");
      return;
    }
    const action = AI_ACTIONS.find((a) => a.id === actionId);
    if (!action) return;
    const resolved = resolveScope(action.preferSelection);
    const scope =
      action.preferSelection && resolved.selection ? "selection" : "essay";
    if (action.preferSelection && actionId !== "title" && !resolved.selection && !resolved.essayMarkdown) {
      setError("Open an essay or select a passage first.");
      return;
    }
    await runChat({
      userText: actionUserPrompt(actionId, scope),
      actionId,
      forceScope: scope,
      forceIncludeEssay: true,
    });
  }

  async function cleanImport() {
    const documentMarkdown = getDocumentMarkdown?.()?.trim() || null;
    if (!documentMarkdown) {
      setError("Open an essay first.");
      return;
    }
    setError(null);
    setBusy(true);
    setPendingApply(null);
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
        model: modelId ?? undefined,
      });
      setMessages((current) => [
        ...current,
        {
          role: "user",
          content: "Clean up this pasted essay (footnotes, headings, quotes).",
        },
        { role: "assistant", content: reply, scope: "essay" },
      ]);
      const cleaned = unwrapMarkdownReply(reply);
      if (cleaned && onApplyMarkdown) {
        const prepared = prepareApply({
          reply: cleaned,
          essayMarkdown: documentMarkdown,
          selectionText: null,
          scope: "essay",
        });
        if (prepared.kind !== "none") {
          setPendingApply({
            messageIndex: -1,
            prepared,
            selection: null,
          });
        } else {
          onApplyMarkdown(cleaned);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  }

  function requestApply(messageIndex: number, content: string, scope: "essay" | "selection" = "essay", selectionText?: string) {
    const essayMarkdown = getDocumentMarkdown?.()?.trim() || null;
    const liveSelection = getSelection?.() ?? null;
    const selection =
      scope === "selection"
        ? liveSelection &&
          (!selectionText || liveSelection.text === selectionText)
          ? liveSelection
          : selectionText
            ? ({
                text: selectionText,
                from: -1,
                to: -1,
                mode: "source" as const,
              } satisfies AiSelection)
            : liveSelection
        : null;

    const prepared = prepareApply({
      reply: content,
      essayMarkdown,
      selectionText: selection?.text ?? selectionText ?? null,
      scope:
        scope === "selection" || (preferSelection && selection)
          ? "selection"
          : "essay",
    });

    if (prepared.kind === "none") {
      setError(prepared.reason);
      return;
    }
    setError(null);
    setPendingApply({
      messageIndex,
      prepared,
      selection:
        prepared.kind === "selection"
          ? selection ?? liveSelection
          : null,
    });
  }

  function confirmPendingApply() {
    if (!pendingApply) return;
    const { prepared, selection } = pendingApply;
    if (prepared.kind === "selection") {
      if (selection && onApplySelection) {
        const ok = onApplySelection(prepared.after, selection);
        if (!ok) {
          setError(
            "Could not replace the selection (it may have changed). Try selecting again."
          );
          return;
        }
      } else if (onApplyMarkdown && prepared.before) {
        // Fallback: replace first exact occurrence in the essay.
        const essay = getDocumentMarkdown?.() ?? "";
        const index = essay.indexOf(prepared.before);
        if (index === -1 || !essay) {
          setError("Selection text no longer found in the essay.");
          return;
        }
        onApplyMarkdown(
          essay.slice(0, index) +
            prepared.after +
            essay.slice(index + prepared.before.length)
        );
      } else {
        setError("Nothing to apply the selection to.");
        return;
      }
    } else {
      onApplyMarkdown?.(prepared.after);
    }
    setPendingApply(null);
  }

  const pendingDiff = useMemo(() => {
    if (!pendingApply) return null;
    if (
      pendingApply.prepared.kind === "document" ||
      pendingApply.prepared.kind === "patches" ||
      pendingApply.prepared.kind === "title"
    ) {
      return applyDiffPreview(
        pendingApply.prepared.before,
        pendingApply.prepared.after,
        1
      ).slice(0, 80);
    }
    if (pendingApply.prepared.kind === "selection") {
      return applyDiffPreview(
        pendingApply.prepared.before,
        pendingApply.prepared.after,
        1
      ).slice(0, 40);
    }
    return null;
  }, [pendingApply]);

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
          stay in this browser and are only sent to the provider when you chat
          (BYOK — BlogIDE does not bill model usage).
        </p>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent"
          onClick={onOpenSettings}
        >
          Open Settings
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
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-2">
        {AI_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busy || (!hasEssay && action.id !== "critique")}
            title={action.title}
            onClick={() => void runAction(action.id)}
            className="rounded border border-border px-2 py-0.5 text-[0.7rem] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {action.label}
          </button>
        ))}
        <label
          className="ml-auto flex items-center gap-1 text-[0.7rem] text-muted"
          title="Model for this provider"
        >
          <span className="sr-only">Model</span>
          <select
            className="max-w-[9.5rem] rounded border border-border bg-background px-1 py-0.5 text-[0.7rem] text-foreground outline-none focus:border-accent"
            value={modelId ?? ""}
            disabled={busy}
            onChange={(event) => setModel(event.target.value)}
          >
            {modelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
              message.content ? (
                <ChatMarkdown markdown={message.content} />
              ) : (
                <span className="text-muted">Thinking…</span>
              )
            ) : (
              <div className="whitespace-pre-wrap">{message.content}</div>
            )}
            {message.role === "assistant" &&
              message.content &&
              onApplyMarkdown &&
              !busy && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      requestApply(
                        index,
                        message.content,
                        message.scope ?? "essay",
                        message.selectionText
                      )
                    }
                    className="rounded border border-border px-2 py-0.5 text-[0.7rem] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
                    title="Preview a patch or replacement, then apply"
                  >
                    Apply…
                  </button>
                </div>
              )}
          </div>
        ))}
        {pendingApply && (
          <div className="rounded-md border border-accent/40 bg-accent/5 px-2.5 py-2 text-xs">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                {pendingApply.prepared.summary}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded border border-border px-2 py-0.5 text-[0.7rem] text-muted hover:border-accent hover:text-accent"
                  onClick={() => setPendingApply(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-white"
                  onClick={confirmPendingApply}
                >
                  Confirm
                </button>
              </div>
            </div>
            {pendingDiff && pendingDiff.length > 0 ? (
              <pre className="max-h-40 overflow-auto rounded border border-border bg-background p-2 font-mono text-[0.65rem] leading-snug">
                {pendingDiff.map((line, i) => (
                  <div
                    key={`${line.type}-${i}`}
                    className={
                      line.type === "add"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : line.type === "remove"
                          ? "text-red-700 dark:text-red-400"
                          : "text-muted"
                    }
                  >
                    {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                    {line.text}
                  </div>
                ))}
              </pre>
            ) : (
              <p className="text-muted">No line-level diff to preview.</p>
            )}
          </div>
        )}
        {busy && messages[messages.length - 1]?.role !== "assistant" && (
          <p className="text-xs text-muted">Thinking…</p>
        )}
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
            preferSelection
              ? "Ask about the selection or essay…"
              : includeEssay && hasEssay
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label
              className={`flex min-w-0 cursor-pointer items-center gap-1.5 text-xs ${
                !hasEssay ? "opacity-40" : "text-foreground"
              }`}
              title={
                hasEssay
                  ? "When a passage is selected, use it as the primary context"
                  : "Open an essay to use selection context"
              }
            >
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={preferSelection && hasEssay}
                disabled={!hasEssay}
                onChange={(event) => setPreferSelection(event.target.checked)}
              />
              Selection context
            </label>
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
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {busy && (
              <button
                type="button"
                className="rounded border border-border px-2 py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
                onClick={() => abortRef.current?.abort()}
              >
                Stop
              </button>
            )}
            <EditorOverflowMenu items={settingsItems} />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
