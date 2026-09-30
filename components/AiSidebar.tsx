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
  findPatchRange,
  footnoteNotes,
  withoutFootnoteDefinitions,
  parseSearchReplacePatches,
  prepareApply,
  splitReplySegments,
  type PreparedApply,
} from "@/lib/ai/apply";
import {
  chatCompletionStream,
  essayChatSystem,
  selectionChatSystem,
  unwrapMarkdownReply,
  type ChatContentPart,
  type ChatMessage,
} from "@/lib/ai/client";
import { loadStoredChats, saveStoredChats } from "@/lib/ai/chatStore";
import { essayImageParts } from "@/lib/ai/images";
import {
  getActiveProvider,
  loadAiKeys,
  saveAiKeys,
  maskKey,
  type AiKeys,
} from "@/lib/ai/keys";
import { modelsForProvider, resolveModel } from "@/lib/ai/models";
import type { AiSelection } from "@/lib/ai/selection";
import { countWords, formatWordCount } from "@/lib/editor/documentStats";
import { reviewDiff, wordDiff } from "@/lib/markdown/wordDiff";
import { WordDiffText } from "@/components/WordDiffText";
import { showCopiedToast, showErrorToast } from "@/lib/ui/toast";

type PatchStatus = "applied" | "missing";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Scope used when generating this assistant turn (for Apply). */
  scope?: "essay" | "selection";
  selectionText?: string;
  /** Canned action that produced this turn (user) / reply (assistant). */
  actionId?: AiActionId;
  /** Essay images sent with this user turn. */
  imageCount?: number;
  /** Short status under a reply (cut off, images dropped, …). */
  notice?: string;
  /** Per patch-block state, keyed by block index. */
  patchStatus?: Record<number, PatchStatus>;
  /** Essay footnotes the model saw, so chat can show notes it only cites. */
  essayNotes?: Record<string, string>;
  /** Whole-reply apply (rewrite / selection / title) went through. */
  applied?: boolean;
};

type PendingApply = {
  messageId: string | null;
  prepared: PreparedApply & { kind: Exclude<PreparedApply["kind"], "none"> };
  selection: AiSelection | null;
};

type UndoState = {
  messageId: string | null;
  /** Essay markdown before this reply's first apply. */
  before: string;
  /** Essay markdown just after the latest apply (captured after the editor settles). */
  after: string | null;
};

function warnChatLoss(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Legacy browsers only show the prompt when returnValue is set.
  event.returnValue = "";
}

type Props = {
  /** True when an essay is open (enables Include essay). */
  essayAvailable?: boolean;
  /** Fresh markdown snapshot — called only on Send / Apply / context refresh. */
  getDocumentMarkdown?: () => string | null;
  /** Current editor selection, if any. */
  getSelection?: () => AiSelection | null;
  onApplyMarkdown?: (markdown: string) => void;
  onApplySelection?: (markdown: string, selection: AiSelection) => boolean;
  onOpenSettings?: () => void;
  /** Open essay's id: each essay keeps its own chat for this session. */
  essayKey?: string | null;
  /** Open essay's title for the context label. */
  essayLabel?: string | null;
};

type Thread = { messages: Message[]; undo: UndoState | null };

/** "[BlogIDE: the writer applied …]" for the turn after an assistant reply. */
function appliedEditsNote(previous: Message | undefined): string {
  if (!previous || previous.role !== "assistant") return "";
  const total = splitReplySegments(previous.content).filter(
    (segment) => segment.type === "patch"
  ).length;
  const applied = Object.values(previous.patchStatus ?? {}).filter(
    (status) => status === "applied"
  ).length;
  if (total > 0 && applied > 0) {
    return `[BlogIDE note: the writer applied ${applied} of your ${total} suggested edit${total === 1 ? "" : "s"}${applied < total ? "; the rest were not applied" : ""}. The current essay already includes the applied ones.]`;
  }
  if (previous.applied) {
    return "[BlogIDE note: the writer applied your previous rewrite. The current essay already includes it.]";
  }
  return "";
}

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `m${Date.now().toString(36)}${messageSeq}`;
}

const chipClass =
  "rounded border border-border px-2 py-0.5 text-[0.7rem] text-muted hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted";

export function AiSidebar({
  essayAvailable = false,
  getDocumentMarkdown,
  getSelection,
  onApplyMarkdown,
  onApplySelection,
  onOpenSettings,
  essayKey = null,
  essayLabel = null,
}: Props) {
  // Always start empty so SSR and the first client paint match; load keys after mount.
  const [keys, setKeys] = useState<AiKeys>({});
  const [keysReady, setKeysReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Send the current essay with every message (fresh snapshot each turn). */
  const [includeEssay, setIncludeEssay] = useState(true);
  /** Prefer selection as context when the editor has one. */
  const [preferSelection, setPreferSelection] = useState(true);
  /** Attach the essay's images to the next messages. */
  const [includeImages, setIncludeImages] = useState(false);
  /** Word count of the live editor selection, refreshed when the panel is approached. */
  const [selectionWords, setSelectionWords] = useState<number | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingApply | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Follow streaming output only while the reader is at the bottom. */
  const nearBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Chats of essays you switched away from (kept for this tab session). */
  const threadsRef = useRef(new Map<string, Thread>());
  const threadKeyRef = useRef(essayKey ?? "");
  const liveThreadRef = useRef<Thread>({ messages, undo });
  /** Stored chats are loaded; until then, don't overwrite them with []. */
  const restoredRef = useRef(false);

  const hasEssay = essayAvailable;

  // Bring back this tab's chats after a reload (after mount, so SSR matches).
  // Undo isn't restored: the editor it would roll back has been rebuilt.
  useEffect(() => {
    const stored = loadStoredChats<Message>();
    for (const [key, stale] of Object.entries(stored)) {
      if (!threadsRef.current.has(key)) {
        threadsRef.current.set(key, { messages: stale, undo: null });
      }
    }
    const current = stored[threadKeyRef.current];
    if (current) setMessages((live) => (live.length > 0 ? live : current));
    restoredRef.current = true;
  }, []);

  // Keep the stored copy current once each reply has finished.
  useEffect(() => {
    if (!restoredRef.current || busy) return;
    const chats: Record<string, Message[]> = {};
    threadsRef.current.forEach((thread, key) => {
      chats[key] = thread.messages;
    });
    chats[threadKeyRef.current] = messages.filter(
      (m) => m.role === "user" || m.content.trim()
    );
    saveStoredChats(chats, threadKeyRef.current);
  }, [messages, busy]);

  // Chats survive a reload but not closing the tab, and a reply still
  // streaming survives neither. The browser can't tell reload from close, so
  // ask on both whenever there's a chat to lose.
  useEffect(() => {
    const hasChat =
      busy ||
      messages.length > 0 ||
      [...threadsRef.current.entries()].some(
        ([key, thread]) => key !== threadKeyRef.current && thread.messages.length > 0
      );
    if (!hasChat) return;
    window.addEventListener("beforeunload", warnChatLoss);
    return () => window.removeEventListener("beforeunload", warnChatLoss);
  }, [messages, busy]);

  // Declared before the swap below so it still holds the outgoing chat.
  useEffect(() => {
    liveThreadRef.current = { messages, undo };
  }, [messages, undo]);

  // Swap to the open essay's chat. An in-flight reply stops and stays in the
  // chat it belongs to; undo and pending reviews never cross essays.
  useEffect(() => {
    const nextKey = essayKey ?? "";
    if (nextKey === threadKeyRef.current) return;
    abortRef.current?.abort();
    threadsRef.current.set(threadKeyRef.current, liveThreadRef.current);
    const next = threadsRef.current.get(nextKey);
    threadKeyRef.current = nextKey;
    setMessages(next?.messages ?? []);
    setUndo(next?.undo ?? null);
    setPendingApply(null);
    setError(null);
    nearBottomRef.current = true;
  }, [essayKey]);

  // New message: jump to it. Streaming: follow along unless scrolled up.
  // Applying an edit (a status change on an old message) never scrolls.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
    nearBottomRef.current = true;
  }, [messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!busy || !el || !nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Grow the composer with its content (up to a cap set in CSS).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

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

  function refreshContext() {
    const selection = getSelection?.() ?? null;
    setSelectionWords(selection?.text ? countWords(selection.text) : null);
  }

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setPendingApply(null);
    setUndo(null);
  }

  function setModel(nextModel: string) {
    if (!provider) return;
    const patch: AiKeys =
      provider === "anthropic"
        ? { anthropicModel: nextModel }
        : { openaiModel: nextModel };
    setKeys(saveAiKeys(patch));
  }

  function updateMessage(id: string, patch: (m: Message) => Partial<Message>) {
    setMessages((current) =>
      current.map((m) => (m.id === id ? { ...m, ...patch(m) } : m))
    );
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
  }): string | undefined {
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
    forceIncludeEssay?: boolean;
    forceScope?: "essay" | "selection";
    /** Thread to continue from (Retry drops the last exchange). */
    base?: Message[];
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
    const scope = opts.forceScope ?? resolved.scope;
    const selection = scope === "selection" ? resolved.selection : null;
    const shouldIncludeEssay =
      hasEssay &&
      (opts.forceIncludeEssay ?? (scope === "selection" ? true : includeEssay));

    const images =
      includeImages && hasEssay && resolved.essayMarkdown
        ? essayImageParts(resolved.essayMarkdown)
        : { parts: [], skipped: 0 };

    const userMessage: Message = {
      id: nextId(),
      role: "user",
      content: trimmed,
      scope,
      selectionText: selection?.text,
      actionId: opts.actionId,
      imageCount: images.parts.length || undefined,
    };
    const history: Message[] = [...(opts.base ?? messages), userMessage];
    const assistantId = nextId();
    setMessages([
      ...history,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        scope,
        selectionText: selection?.text,
        actionId: opts.actionId,
        essayNotes: resolved.essayMarkdown
          ? footnoteNotes(resolved.essayMarkdown)
          : undefined,
      },
    ]);
    setInput("");

    const system = buildSystem({
      scope,
      selection,
      essayMarkdown: resolved.essayMarkdown,
      includeEssay: shouldIncludeEssay,
      actionId: opts.actionId,
    });

    const toApi = (withImages: boolean): ChatMessage[] =>
      history.map((m, i) => {
        // Tell the model which of its earlier edits the writer applied; the
        // essay it's given is always the current one, so without this a
        // follow-up reads "those errors aren't in the essay".
        const note = i > 0 && m.role === "user" ? appliedEditsNote(history[i - 1]) : "";
        const text = note ? `${note}\n\n${m.content}` : m.content;
        if (m.id === userMessage.id && withImages && images.parts.length > 0) {
          const parts: ChatContentPart[] = [
            ...images.parts,
            { type: "text", text },
          ];
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: text };
      });

    const notices: string[] = [];
    if (images.skipped > 0) {
      notices.push(
        `${images.skipped} image${images.skipped === 1 ? "" : "s"} not sent (not a public https image, or over the limit).`
      );
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const stream = (withImages: boolean) =>
      chatCompletionStream({
        messages: toApi(withImages),
        system,
        provider: provider ?? undefined,
        model: modelId ?? undefined,
        signal: controller.signal,
        onDelta: (chunk) => {
          updateMessage(assistantId, (m) => ({ content: m.content + chunk }));
        },
        onTruncated: () => {
          notices.push("Reply hit the length limit and was cut off.");
        },
      });

    try {
      let reply: string;
      try {
        reply = await stream(images.parts.length > 0);
      } catch (err) {
        // A provider that can't download an image fails the whole request;
        // answer without them rather than making the writer retry.
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted || images.parts.length === 0) throw err;
        updateMessage(userMessage.id, () => ({ imageCount: undefined }));
        updateMessage(assistantId, () => ({ content: "" }));
        notices.push("Images could not be sent, so this answer is text-only.");
        reply = await stream(false);
      }
      updateMessage(assistantId, (m) => ({
        content: reply || m.content,
        notice: notices.length > 0 ? notices.join(" ") : undefined,
      }));
      if (action?.expectRewrite && reply.trim()) {
        const isPatchReply = Boolean(parseSearchReplacePatches(reply));
        if (!isPatchReply && (scope === "selection" || action.id === "title")) {
          // Rewrites of a selection / title: open the review straight away.
          requestApply(
            { id: assistantId, content: reply, scope, selectionText: selection?.text },
            { quiet: true, selection }
          );
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((current) =>
          current.filter((m) => !(m.id === assistantId && !m.content))
        );
      } else {
        setError(err instanceof Error ? err.message : "Request failed.");
        setMessages((current) =>
          current.filter((m) => !(m.id === assistantId && !m.content.trim()))
        );
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      refreshContext();
    }
  }

  async function send(text: string) {
    await runChat({ userText: text });
  }

  function retryLast() {
    let userIndex = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        userIndex = i;
        break;
      }
    }
    if (userIndex === -1 || busy) return;
    const last = messages[userIndex];
    void runChat({
      userText: last.content,
      actionId: last.actionId,
      forceScope: last.actionId ? last.scope : undefined,
      forceIncludeEssay: last.actionId ? true : undefined,
      base: messages.slice(0, userIndex),
    });
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

  /** Remember the pre-apply essay so this reply's edits can be undone. */
  function rememberUndo(messageId: string | null, before: string) {
    setUndo((current) => ({
      messageId,
      before: current && current.messageId === messageId ? current.before : before,
      after: null,
    }));
    // Read back after the editor re-renders so later edits can be detected.
    window.setTimeout(() => {
      const settled = getDocumentMarkdown?.() ?? null;
      setUndo((current) =>
        current && current.messageId === messageId
          ? { ...current, after: settled }
          : current
      );
    }, 300);
  }

  /** Apply a full-essay replacement and remember how to undo it. */
  function commitEssay(messageId: string | null, before: string, next: string) {
    onApplyMarkdown?.(next);
    rememberUndo(messageId, before);
  }

  function undoApply() {
    if (!undo || !onApplyMarkdown) return;
    const current = getDocumentMarkdown?.() ?? null;
    if (
      undo.after != null &&
      current != null &&
      current !== undo.after &&
      !window.confirm(
        "The essay changed after this edit was applied. Undo anyway? Those later changes will be lost."
      )
    ) {
      return;
    }
    onApplyMarkdown(undo.before);
    if (undo.messageId) {
      updateMessage(undo.messageId, () => ({
        applied: false,
        patchStatus: undefined,
      }));
    }
    setUndo(null);
  }

  function applyPatches(message: Message, indexes: number[]) {
    const essay = getDocumentMarkdown?.() ?? null;
    if (!essay || !onApplyMarkdown) {
      setError("Open the essay to apply edits.");
      return;
    }
    const patches = splitReplySegments(message.content).filter(
      (s): s is Extract<typeof s, { type: "patch" }> => s.type === "patch"
    );
    let next = essay;
    const status: Record<number, PatchStatus> = { ...(message.patchStatus ?? {}) };
    let applied = 0;
    for (const patch of patches) {
      if (!indexes.includes(patch.index)) continue;
      const range = findPatchRange(next, patch.search);
      if (!range) {
        status[patch.index] = "missing";
        continue;
      }
      next = next.slice(0, range.from) + patch.replace + next.slice(range.to);
      status[patch.index] = "applied";
      applied += 1;
    }
    updateMessage(message.id, () => ({ patchStatus: status }));
    if (applied > 0) {
      setError(null);
      commitEssay(message.id, essay, next);
    } else {
      setError("That text is no longer in the essay (it may already be edited).");
    }
  }

  function requestApply(
    message: Pick<Message, "id" | "content" | "scope" | "selectionText">,
    options: { quiet?: boolean; selection?: AiSelection | null } = {}
  ) {
    const scope = message.scope ?? "essay";
    const selectionText = message.selectionText;
    const essayMarkdown = getDocumentMarkdown?.()?.trim() || null;
    const liveSelection = getSelection?.() ?? null;
    const selection =
      scope === "selection"
        ? options.selection && options.selection.text === selectionText
          ? options.selection
          : liveSelection &&
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
      reply: message.content,
      essayMarkdown,
      selectionText: selection?.text ?? selectionText ?? null,
      scope: scope === "selection" && selection ? "selection" : "essay",
    });

    if (prepared.kind === "none") {
      if (!options.quiet) setError(prepared.reason);
      return;
    }
    setError(null);
    setPendingApply({
      messageId: message.id,
      prepared,
      selection: prepared.kind === "selection" ? selection ?? liveSelection : null,
    });
  }

  function confirmPendingApply() {
    if (!pendingApply) return;
    const { prepared, selection, messageId } = pendingApply;
    const before = getDocumentMarkdown?.() ?? null;
    if (prepared.kind === "selection") {
      let next: string | null = null;
      if (selection && selection.from >= 0 && onApplySelection) {
        const ok = onApplySelection(prepared.after, selection);
        if (!ok) {
          setError(
            "Could not replace the selection (it may have changed). Try selecting again."
          );
          return;
        }
      } else if (before) {
        // Selection is gone: replace the passage where it sits in the essay.
        // A WYSIWYG selection carries its footnote definitions at the end;
        // the essay keeps those in its own notes section.
        const range = findPatchRange(
          before,
          withoutFootnoteDefinitions(prepared.before)
        );
        if (!range) {
          setError("Selection text no longer found in the essay.");
          return;
        }
        next =
          before.slice(0, range.from) +
          withoutFootnoteDefinitions(prepared.after) +
          before.slice(range.to);
      } else {
        setError("Nothing to apply the selection to.");
        return;
      }
      if (next != null && before != null) commitEssay(messageId, before, next);
      else if (before != null) rememberUndo(messageId, before);
    } else if (prepared.kind === "patches") {
      const message = messages.find((m) => m.id === messageId);
      if (message) {
        const all = splitReplySegments(message.content)
          .filter((s) => s.type === "patch")
          .map((s) => (s.type === "patch" ? s.index : -1));
        applyPatches(message, all);
      } else if (before != null) {
        commitEssay(messageId, before, prepared.after);
      }
    } else if (before != null) {
      commitEssay(messageId, before, prepared.after);
    } else {
      onApplyMarkdown?.(prepared.after);
    }
    if (messageId) updateMessage(messageId, () => ({ applied: true }));
    setPendingApply(null);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showCopiedToast("Copied reply.");
    } catch (err) {
      showErrorToast(err, "Could not copy.", "clipboard-copy");
    }
  }

  const pendingRows = useMemo(() => {
    if (!pendingApply) return null;
    return reviewDiff(
      pendingApply.prepared.before,
      pendingApply.prepared.after,
      1
    ).slice(0, 60);
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

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;
  const usingSelection = preferSelection && hasEssay && selectionWords != null;
  const essayName = essayLabel?.trim() || "Open essay";
  const contextLabel = !hasEssay
    ? "No essay open"
    : usingSelection
      ? `${essayName} · selection, ${formatWordCount(selectionWords)}`
      : includeEssay
        ? essayName
        : `${essayName} (not sent)`;

  const reviewPanel = pendingApply && (
    <ReviewPanel
      summary={pendingApply.prepared.summary}
      rows={pendingRows ?? []}
      onCancel={() => setPendingApply(null)}
      onConfirm={confirmPendingApply}
    />
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col text-sm"
      onPointerEnter={refreshContext}
      onFocusCapture={refreshContext}
      onKeyDown={(event) => {
        if (event.key === "Escape" && busy) {
          event.preventDefault();
          abortRef.current?.abort();
        }
      }}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
        <button
          type="button"
          className={chipClass}
          disabled={busy || messages.length === 0}
          onClick={clearChat}
          title="Start a new conversation"
        >
          New chat
        </button>
        <label
          className="ml-auto flex min-w-0 items-center gap-1 text-[0.7rem] text-muted"
          title={
            modelOptions.find((option) => option.id === modelId)?.hint ??
            "Model for this provider"
          }
        >
          <span className="sr-only">Model</span>
          <select
            className="min-w-0 max-w-[14rem] rounded border border-border bg-background px-1 py-0.5 text-[0.7rem] text-foreground outline-none focus:border-accent"
            value={modelId ?? ""}
            disabled={busy}
            onChange={(event) => setModel(event.target.value)}
          >
            {modelOptions.map((option) => (
              <option key={option.id} value={option.id} title={option.hint}>
                {option.label} · {option.hint}
              </option>
            ))}
          </select>
        </label>
        <EditorOverflowMenu items={settingsItems} />
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
        onScroll={(event) => {
          const el = event.currentTarget;
          nearBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {messages.length === 0 && (
          <div className="ai-empty text-xs text-muted">
            <p className="mb-1.5 font-medium text-foreground">
              {hasEssay && essayLabel
                ? `Chat about “${essayLabel}”`
                : "Ask about your essay, or pick an action below."}
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                The open essay is always the context: its latest version goes
                with every message.
              </li>
              <li>Select a passage first to focus on just that part.</li>
              <li>
                Suggested edits show as before / after cards you can apply one
                at a time, then undo.
              </li>
              <li>
                Each essay keeps its own chat until you close the tab (a reload
                keeps it); switching essays switches chats.
              </li>
            </ul>
          </div>
        )}
        {messages.map((message) => {
          const isStreaming = busy && message.id === lastAssistantId;
          return (
            <div
              key={message.id}
              className={`rounded-md px-2.5 py-2 text-xs leading-relaxed ${
                message.role === "user"
                  ? "bg-accent/10 text-foreground"
                  : "bg-panel text-foreground"
              }`}
            >
              {message.role === "assistant" ? (
                message.content ? (
                  <AssistantBody
                    message={message}
                    streaming={isStreaming}
                    canApply={Boolean(onApplyMarkdown) && !isStreaming}
                    onApplyPatch={(index) => applyPatches(message, [index])}
                  />
                ) : (
                  <ThinkingDots />
                )
              ) : (
                <UserBody message={message} />
              )}
              {message.role === "assistant" && message.notice && (
                <p className="mt-1.5 text-[0.65rem] text-amber-700 dark:text-amber-400">
                  {message.notice}
                </p>
              )}
              {message.role === "assistant" && message.content && !isStreaming && (
                <AssistantFooter
                  message={message}
                  canApply={Boolean(onApplyMarkdown) && !busy}
                  isLast={message.id === lastAssistantId}
                  canUndo={undo?.messageId === message.id && !busy}
                  onCopy={() => void copyText(unwrapMarkdownReply(message.content))}
                  onRetry={retryLast}
                  onReview={() => requestApply(message)}
                  onApplyAll={(indexes) => applyPatches(message, indexes)}
                  onUndo={undoApply}
                />
              )}
              {pendingApply?.messageId === message.id && reviewPanel}
            </div>
          );
        })}
        {pendingApply &&
          !messages.some((m) => m.id === pendingApply.messageId) &&
          reviewPanel}
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
        <div
          className={`ai-context mb-2 ${usingSelection ? "is-selection" : ""}`}
          title={
            hasEssay
              ? "The open essay goes with every message; a selection narrows the focus"
              : "Open an essay to chat about it"
          }
        >
          <span className="ai-context-label">Context</span>
          <span className="truncate">{contextLabel}</span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-1">
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={busy || (!hasEssay && action.id !== "critique")}
              title={action.title}
              onClick={() => void runAction(action.id)}
              className={chipClass}
            >
              {action.label}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={2}
          placeholder={
            usingSelection
              ? "Ask about the selection…"
              : includeEssay && hasEssay
                ? "Ask about this essay…"
                : "Message the assistant…"
          }
          className="ai-composer mb-2 w-full resize-none rounded border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-accent"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(input);
            }
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <ContextToggle
              label="Selection"
              title={
                hasEssay
                  ? "When a passage is selected, focus on it (the essay still goes along as background)"
                  : "Open an essay to use selection context"
              }
              checked={preferSelection && hasEssay}
              disabled={!hasEssay}
              onChange={setPreferSelection}
            />
            <ContextToggle
              label="Essay"
              title={
                hasEssay
                  ? "Send the current version of the essay with every message"
                  : "Open an essay to attach it"
              }
              checked={includeEssay && hasEssay}
              disabled={!hasEssay}
              onChange={setIncludeEssay}
            />
            <ContextToggle
              label="Images"
              title={
                hasEssay
                  ? "Also send the essay's images (public https images, up to 8) so the model can see them. Costs more tokens."
                  : "Open an essay to send its images"
              }
              checked={includeImages && hasEssay}
              disabled={!hasEssay}
              onChange={setIncludeImages}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {busy ? (
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
                onClick={() => abortRef.current?.abort()}
                title="Stop (Esc)"
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                title="Send (Enter) · new line (Shift+Enter)"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function ContextToggle({
  label,
  title,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  title: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-1.5 text-xs ${
        disabled ? "opacity-40" : "text-foreground"
      }`}
      title={title}
    >
      <input
        type="checkbox"
        className="accent-[var(--accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function ThinkingDots() {
  return (
    <span className="ai-thinking" role="status" aria-label="Thinking">
      <span />
      <span />
      <span />
    </span>
  );
}

function UserBody({ message }: { message: Message }) {
  const action = message.actionId
    ? AI_ACTIONS.find((a) => a.id === message.actionId)
    : undefined;
  const scopeNote =
    message.scope === "selection" && message.selectionText
      ? `Selection · ${formatWordCount(countWords(message.selectionText))}`
      : null;
  return (
    <div>
      {action ? (
        <div className="font-medium">{action.label}</div>
      ) : (
        <div className="whitespace-pre-wrap">{message.content}</div>
      )}
      {(scopeNote || message.imageCount) && (
        <div className="mt-1 text-[0.65rem] text-muted">
          {[
            scopeNote,
            message.imageCount
              ? `${message.imageCount} image${message.imageCount === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}

function AssistantBody({
  message,
  streaming,
  canApply,
  onApplyPatch,
}: {
  message: Message;
  streaming: boolean;
  canApply: boolean;
  onApplyPatch: (index: number) => void;
}) {
  const segments = useMemo(
    () => splitReplySegments(message.content),
    [message.content]
  );
  return (
    <div className="space-y-2">
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          return <ChatMarkdown
              key={`t${i}`}
              markdown={segment.text}
              streaming={streaming}
              notes={message.essayNotes}
            />;
        }
        if (segment.type === "pending-patch") {
          return (
            <div key={`p${i}`} className="ai-patch ai-patch-pending">
              <ThinkingDots /> <span className="text-muted">Drafting edit…</span>
            </div>
          );
        }
        const status = message.patchStatus?.[segment.index];
        return (
          <PatchCard
            key={`p${i}`}
            search={segment.search}
            replace={segment.replace}
            status={status}
            canApply={canApply}
            onApply={() => onApplyPatch(segment.index)}
          />
        );
      })}
    </div>
  );
}

function PatchCard({
  search,
  replace,
  status,
  canApply,
  onApply,
}: {
  search: string;
  replace: string;
  status?: PatchStatus;
  canApply: boolean;
  onApply: () => void;
}) {
  const segments = useMemo(() => wordDiff(search, replace), [search, replace]);
  return (
    <div className={`ai-patch ${status === "applied" ? "is-applied" : ""}`}>
      <WordDiffText segments={segments} />
      <div className="mt-1.5 flex items-center justify-end gap-2">
        {status === "missing" && (
          <span className="text-[0.65rem] text-red-600 dark:text-red-400">
            Not found in essay
          </span>
        )}
        {status === "applied" ? (
          <span className="text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-400">
            ✓ Applied
          </span>
        ) : (
          canApply && (
            <button
              type="button"
              className={chipClass}
              onClick={onApply}
              title="Replace this passage in the essay"
            >
              Apply
            </button>
          )
        )}
      </div>
    </div>
  );
}

function AssistantFooter({
  message,
  canApply,
  isLast,
  canUndo,
  onCopy,
  onRetry,
  onReview,
  onApplyAll,
  onUndo,
}: {
  message: Message;
  canApply: boolean;
  isLast: boolean;
  canUndo: boolean;
  onCopy: () => void;
  onRetry: () => void;
  onReview: () => void;
  onApplyAll: (indexes: number[]) => void;
  onUndo: () => void;
}) {
  const patchIndexes = useMemo(
    () =>
      splitReplySegments(message.content).flatMap((s) =>
        s.type === "patch" ? [s.index] : []
      ),
    [message.content]
  );
  const remaining = patchIndexes.filter(
    (index) => message.patchStatus?.[index] !== "applied"
  );
  // Critique / proofread replies are prose (proofread edits come as patches).
  const isCritique =
    message.actionId === "critique" || message.actionId === "proofread";
  return (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
      <button type="button" className={chipClass} onClick={onCopy} title="Copy reply">
        Copy
      </button>
      {isLast && (
        <button type="button" className={chipClass} onClick={onRetry} title="Ask again">
          Retry
        </button>
      )}
      {canUndo && (
        <button
          type="button"
          className={chipClass}
          onClick={onUndo}
          title="Restore the essay from before these edits"
        >
          Undo
        </button>
      )}
      {canApply && patchIndexes.length > 1 && remaining.length > 0 && (
        <button
          type="button"
          className="rounded bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-white"
          onClick={() => onApplyAll(remaining)}
        >
          Apply {remaining.length === patchIndexes.length ? "all" : "rest"} ({remaining.length})
        </button>
      )}
      {canApply && patchIndexes.length === 0 && !isCritique && (
        message.applied ? (
          <span className="px-1 text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-400">
            ✓ Applied
          </span>
        ) : (
          <button
            type="button"
            className={chipClass}
            onClick={onReview}
            title="Preview the change, then apply it to the essay"
          >
            Review & apply…
          </button>
        )
      )}
    </div>
  );
}

function ReviewPanel({
  summary,
  rows,
  onCancel,
  onConfirm,
}: {
  summary: string;
  rows: ReturnType<typeof reviewDiff>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Bring the review into view without jumping to the end of the chat.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <div
      ref={panelRef}
      className="mt-2 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-2 text-xs"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{summary}</span>
        <div className="flex gap-1">
          <button type="button" className={chipClass} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-accent px-2 py-0.5 text-[0.7rem] font-medium text-white"
            onClick={onConfirm}
          >
            Apply
          </button>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="max-h-60 space-y-1.5 overflow-auto rounded border border-border bg-background p-2">
          {rows.map((row, i) =>
            row.type === "context" ? (
              <div key={i} className="word-diff-context">
                {row.text}
              </div>
            ) : (
              <WordDiffText key={i} segments={row.segments} />
            )
          )}
        </div>
      ) : (
        <p className="text-muted">No visible changes.</p>
      )}
    </div>
  );
}
