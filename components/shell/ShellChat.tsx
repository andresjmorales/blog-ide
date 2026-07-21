"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendQuickNote } from "@/lib/capture/appendQuickNote";
import {
  captureNoteKey,
  parseCaptureNotes,
  type CaptureNote,
} from "@/lib/capture/format";
import { removeQuickNote } from "@/lib/capture/removeQuickNote";
import { markShellSeen } from "@/lib/capture/seen";
import { openDocument } from "@/lib/sync/engine";
import {
  channelDisplayName,
  getNotesChannel,
  listInboxChannels,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

export type ListedNote = CaptureNote & {
  channelId: string;
  channelName: string;
};

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
};

export function ShellChat({
  nodes,
  refreshKey,
  onNotesChanged,
  compactMeta = false,
  className = "",
}: Props) {
  const channels = useMemo(() => listInboxChannels(nodes), [nodes]);
  const defaultChannel = useMemo(
    () => getNotesChannel(nodes) ?? channels[0] ?? null,
    [nodes, channels]
  );
  const [filter, setFilter] = useState<string>("all");
  /** Null = use default notes channel when available. */
  const [composeChannelId, setComposeChannelId] = useState<string | null>(null);
  const [notes, setNotes] = useState<ListedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const composeChannel =
    channels.find((c) => c.id === composeChannelId) ?? defaultChannel;

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
      setError(err instanceof Error ? err.message : "Could not load inbox.");
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
    if (filter === "all") return notes;
    return notes.filter((n) => n.channelId === filter);
  }, [notes, filter]);

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
    if (!text || busy || !composeChannel) return;
    setBusy(true);
    setError(null);
    try {
      await appendQuickNote({ channelNodeId: composeChannel.id, text });
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
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function dismissNote(note: ListedNote) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeQuickNote({
        channelNodeId: note.channelId,
        at: note.at,
        text: note.text,
      });
      await loadNotes();
      onNotesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col bg-panel/40 font-mono text-[0.8rem] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[0.7rem] text-muted">
        <span className="text-accent" aria-hidden>
          $
        </span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-border bg-background px-1.5 py-0.5 outline-none focus:border-accent"
        >
          <option value="all">All channels</option>
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {channelDisplayName(ch)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-muted hover:text-foreground"
          onClick={() => void loadNotes()}
          title="Refresh"
        >
          refresh
        </button>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {loading && notes.length === 0 && (
          <p className="text-muted"># loading inbox…</p>
        )}
        {!loading && visible.length === 0 && (
          <p className="text-muted">
            # empty — type a note below (timestamped capture, not a markdown dump)
          </p>
        )}
        {visible.map((note) => {
          const key = captureNoteKey(note.channelId, note);
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
        className="flex items-center gap-2 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <select
          value={composeChannel?.id ?? ""}
          onChange={(e) => setComposeChannelId(e.target.value || null)}
          className="shrink-0 rounded border border-border bg-background px-1.5 py-1 text-[0.7rem] outline-none focus:border-accent"
          disabled={channels.length === 0}
          title="Channel"
        >
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {channelDisplayName(ch)}
            </option>
          ))}
        </select>
        <span className="shrink-0 text-accent" aria-hidden>
          &gt;
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="note to self…"
          className="min-w-0 flex-1 border-0 bg-transparent py-1 outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || !input.trim() || !composeChannel}
          className="shrink-0 rounded border border-border px-2 py-1 text-[0.7rem] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          enter
        </button>
      </form>
    </div>
  );
}
