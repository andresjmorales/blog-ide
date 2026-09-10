"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { collapseBroadcastNotes, type ChannelCaptureNote } from "@/lib/capture/broadcastNotes";
import { appendQuickNote } from "@/lib/capture/appendQuickNote";
import { requestCaptureRefresh } from "@/lib/capture/refresh";
import { showCopiedToast, showErrorToast, showSuccessToast } from "@/lib/ui/toast";
import {
  captureNoteKey,
  parseCaptureNotes,
} from "@/lib/capture/format";
import { removeQuickNote } from "@/lib/capture/removeQuickNote";
import { markShellSeen } from "@/lib/capture/seen";
import { openDocument } from "@/lib/sync/engine";
import { NotesManagerMenu } from "@/components/shell/NotesManagerMenu";
import { ShellSelect } from "@/components/shell/ShellSelect";
import {
  channelDisplayName,
  getInboxNode,
  getNotesChannel,
  getTrashNode,
  isInTrash,
  listInboxChannels,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

export type ListedNote = ChannelCaptureNote;

const ALL_CHANNELS = "__all__";

type Props = {
  nodes: WorkspaceNode[];
  refreshKey?: number | string;
  /** Called after send/delete so dock + pop-out stay in sync. */
  onNotesChanged?: () => void;
  /**
   * Pop-out: show `$` instead of `[timestamp channel]` (details on hover).
   * Docked Shell keeps the full bracket prefix.
   */
  compactMeta?: boolean;
  className?: string;
  onNewChannel?: () => void;
  onOpenChannelDoc?: (channelId: string) => void;
  onRenameChannel?: (channelId: string) => void;
  onTrashChannel?: (channelId: string) => void;
};

export function ShellChat({
  nodes,
  refreshKey,
  onNotesChanged,
  compactMeta = false,
  className = "",
  onNewChannel,
  onOpenChannelDoc,
  onRenameChannel,
  onTrashChannel,
}: Props) {
  const channels = useMemo(() => listInboxChannels(nodes), [nodes]);
  const defaultChannel = useMemo(
    () => getNotesChannel(nodes) ?? channels[0] ?? null,
    [nodes, channels]
  );
  const essayDocs = useMemo(() => {
    const inboxId = getInboxNode(nodes)?.id ?? null;
    const trashId = getTrashNode(nodes)?.id ?? null;
    return nodes
      .filter(
        (n) =>
          n.kind === "document" &&
          n.parent_id !== inboxId &&
          !isInTrash(n.id, nodes, trashId)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nodes]);

  const [filter, setFilter] = useState<string>("all");
  /** Null = use default notes channel when available. */
  const [composeChannelId, setComposeChannelId] = useState<string | null>(null);
  const [appendDocId, setAppendDocId] = useState<string>("");
  const [appendOpen, setAppendOpen] = useState(false);
  const [notes, setNotes] = useState<ListedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const sendToAll = composeChannelId === ALL_CHANNELS;
  const composeChannel = sendToAll
    ? null
    : (channels.find((c) => c.id === composeChannelId) ?? defaultChannel);

  const loadNotes = useCallback(async () => {
    if (channels.length === 0) {
      setNotes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const collected: ListedNote[] = [];
      for (const channel of channels) {
        const opened = await openDocument(channel.id);
        for (const note of parseCaptureNotes(opened.markdown)) {
          collected.push({
            ...note,
            channelId: channel.id,
            channelName: channelDisplayName(channel),
          });
        }
      }
      collected.sort((a, b) => {
        if (a.atMs !== b.atMs) return a.atMs - b.atMs;
        return a.at.localeCompare(b.at);
      });
      setNotes(collected);
      const newest = collected.reduce((max, n) => Math.max(max, n.atMs), 0);
      markShellSeen(Math.max(Date.now(), newest));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notes.");
    } finally {
      setLoading(false);
    }
  }, [channels]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadNotes();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadNotes, refreshKey]);

  const visible = useMemo(() => {
    if (filter === "all") return collapseBroadcastNotes(notes, channels.length);
    return notes.filter((n) => n.channelId === filter);
  }, [notes, filter, channels.length]);

  const scrollToTail = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToTail();
  }, [visible.length, filter, scrollToTail]);

  // A hidden dock can't scroll (display:none) — when the panel is opened or
  // resized, re-anchor to the tail unless the user is reading scrollback.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const current = listRef.current;
      if (!current) return;
      const nearBottom =
        current.scrollHeight - current.scrollTop - current.clientHeight < 80;
      if (nearBottom || current.scrollTop === 0) scrollToTail();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollToTail]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const targets = sendToAll
      ? channels
      : composeChannel
        ? [composeChannel]
        : [];
    if (targets.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const at = new Date();
      for (const channel of targets) {
        await appendQuickNote({ channelNodeId: channel.id, text, at });
      }
      if (appendOpen && appendDocId) {
        await appendQuickNote({ channelNodeId: appendDocId, text, at });
      }
      setInput("");
      await loadNotes();
      onNotesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send note.");
    } finally {
      setBusy(false);
    }
  }

  async function copyNote(note: ListedNote) {
    const key = captureNoteKey(note.channelId, note);
    try {
      await navigator.clipboard.writeText(note.text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
      showCopiedToast("Copied note.");
    } catch {
      setError("Could not copy to clipboard.");
      showErrorToast("Could not copy to the clipboard.", "Could not copy.", "clipboard-copy");
    }
  }

  async function dismissNote(note: ListedNote) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const targets = note.channelIds?.length
        ? note.channelIds
        : [note.channelId];
      for (const channelId of targets) {
        await removeQuickNote({
          channelNodeId: channelId,
          at: note.at,
          text: note.text,
        });
      }
      await loadNotes();
      onNotesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss note.");
    } finally {
      setBusy(false);
    }
  }

  const canSend =
    Boolean(input.trim()) &&
    !busy &&
    (sendToAll ? channels.length > 0 : Boolean(composeChannel));

  const fitComposer = useCallback(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 176)}px`;
  }, []);

  useLayoutEffect(() => {
    fitComposer();
  }, [input, fitComposer]);

  function hideAppend() {
    setAppendOpen(false);
    setAppendDocId("");
  }

  function toggleAppend() {
    if (appendOpen) hideAppend();
    else setAppendOpen(true);
  }

  const composeChannelOptions = useMemo(
    () => [
      ...channels.map((ch) => ({
        value: ch.id,
        label: channelDisplayName(ch),
      })),
      ...(channels.length > 1
        ? [{ value: ALL_CHANNELS, label: "All channels" }]
        : []),
    ],
    [channels]
  );

  const filterOptions = useMemo(
    () => [
      { value: "all", label: "All channels" },
      ...channels.map((ch) => ({
        value: ch.id,
        label: channelDisplayName(ch),
      })),
    ],
    [channels]
  );

  const appendDocOptions = useMemo(
    () => [
      { value: "", label: "Append to…" },
      ...essayDocs.map((doc) => ({
        value: doc.id,
        label: doc.name.replace(/\.md$/i, ""),
      })),
    ],
    [essayDocs]
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col bg-panel/40 font-mono text-[0.8rem] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[0.7rem] text-muted">
        <span className="text-accent" aria-hidden>
          $
        </span>
        <ShellSelect
          value={filter}
          onChange={setFilter}
          options={filterOptions}
          aria-label="Viewing channel"
          title="Viewing channel"
          className="w-max max-w-[12rem]"
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-muted hover:text-foreground disabled:opacity-40"
            onClick={() => {
              if (pulling) return;
              void (async () => {
                setPulling(true);
                try {
                  await requestCaptureRefresh();
                  await loadNotes();
                  showSuccessToast("Refreshed notes.", undefined, "notes-refresh");
                } catch (err) {
                  showErrorToast(err, "Could not refresh notes.", "notes-refresh");
                } finally {
                  setPulling(false);
                }
              })();
            }}
            disabled={pulling}
            title="Pull from Pushbullet and ntfy, then reload this list"
          >
            {pulling ? "pulling…" : "refresh"}
          </button>
          {onNewChannel &&
            onOpenChannelDoc &&
            onRenameChannel &&
            onTrashChannel && (
              <NotesManagerMenu
                nodes={nodes}
                onNewChannel={onNewChannel}
                onOpenChannelDoc={onOpenChannelDoc}
                onRenameChannel={onRenameChannel}
                onTrashChannel={onTrashChannel}
              />
            )}
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {loading && notes.length === 0 && (
          <p className="text-muted"># loading notes…</p>
        )}
        {!loading && visible.length === 0 && (
          <p className="text-muted">
            # empty. Type a note below (timestamped capture, not a markdown dump)
          </p>
        )}
        {visible.map((note) => {
          const key = note.channelIds?.length
            ? `all\0${note.at}\0${note.text}`
            : captureNoteKey(note.channelId, note);
          const channelTag =
            filter === "all" ? ` ${note.channelName}` : "";
          const metaLabel = `[${note.at}${channelTag}]`;
          return (
            <div
              key={key}
              className="group flex items-start gap-2 border-b border-border/50 py-1.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1 leading-relaxed">
                {compactMeta ? (
                  <span
                    className="text-accent"
                    title={metaLabel}
                    aria-label={metaLabel}
                  >
                    $
                  </span>
                ) : (
                  <span className="text-muted">{metaLabel}</span>
                )}{" "}
                <span className="whitespace-pre-wrap text-foreground">
                  {note.text}
                </span>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  title="Copy note"
                  aria-label="Copy note"
                  className="rounded border border-transparent px-1 py-0.5 text-[0.65rem] text-muted hover:border-border hover:text-accent"
                  onClick={() => void copyNote(note)}
                >
                  {copiedKey === key ? "ok" : "cp"}
                </button>
                <button
                  type="button"
                  title="Dismiss note"
                  aria-label="Dismiss note"
                  className="rounded border border-transparent px-1 py-0.5 text-[0.65rem] text-muted hover:border-border hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => void dismissNote(note)}
                  disabled={busy}
                >
                  rm
                </button>
              </div>
            </div>
          );
        })}
        {error && (
          <p className="mt-2 text-red-600 dark:text-red-400">! {error}</p>
        )}
      </div>

      <form
        className="flex flex-col gap-1.5 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex items-start gap-2">
          <span className="mt-1.5 shrink-0 text-accent" aria-hidden>
            &gt;
          </span>
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="note to self…"
            rows={3}
            aria-label="Note"
            title="Enter to send, Shift+Enter for a new line"
            className="min-h-[4.5rem] min-w-0 flex-1 resize-none border-0 bg-transparent py-1.5 leading-relaxed outline-none placeholder:text-muted"
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
                return;
              }
              e.preventDefault();
              void send();
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <ShellSelect
            value={sendToAll ? ALL_CHANNELS : (composeChannel?.id ?? "")}
            onChange={(v) => setComposeChannelId(v || null)}
            options={composeChannelOptions}
            disabled={channels.length === 0}
            aria-label="Channel"
            title="Channel"
            placement="up"
            className="w-max max-w-[9.5rem] shrink-0"
          />
          {essayDocs.length > 0 && (
            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                aria-pressed={appendOpen}
                aria-expanded={appendOpen}
                aria-label="Append"
                title={
                  appendOpen
                    ? "Hide append to document"
                    : "Also append to a document"
                }
                className={`shrink-0 rounded px-1.5 py-0.5 font-sans text-[0.7rem] ${
                  appendOpen
                    ? "text-accent"
                    : "text-muted hover:text-foreground"
                }`}
                onClick={toggleAppend}
              >
                Append
              </button>
              {appendOpen && (
                <>
                  <ShellSelect
                    value={appendDocId}
                    onChange={setAppendDocId}
                    options={appendDocOptions}
                    aria-label="Append to document"
                    title="Append to document"
                    placement="up"
                    className="min-w-0 w-[8.5rem]"
                  />
                  <button
                    type="button"
                    aria-label="Cancel append to document"
                    title="Cancel append to document"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent text-lg leading-none text-muted hover:border-border hover:text-foreground"
                    onClick={hideAppend}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          )}
          <button type="submit" className="sr-only" disabled={!canSend}>
            Send note
          </button>
        </div>
      </form>
    </div>
  );
}
