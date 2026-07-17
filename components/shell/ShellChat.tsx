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
  className?: string;
};

export function ShellChat({
  nodes,
  refreshKey,
  onNotesChanged,
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
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length, filter]);

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
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[0.7rem] outline-none focus:border-accent"
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
          className="rounded px-1.5 py-0.5 font-mono text-[0.65rem] text-muted hover:text-foreground"
          onClick={() => void loadNotes()}
          title="Refresh"
        >
          Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {loading && notes.length === 0 && (
          <p className="font-mono text-xs text-muted">Loading inbox…</p>
        )}
        {!loading && visible.length === 0 && (
          <p className="font-mono text-xs text-muted">
            No notes yet — send one below (Pushbullet-style, not a markdown dump).
          </p>
        )}
            {visible.map((note) => {
          const key = captureNoteKey(note.channelId, note);
          return (
            <div
              key={key}
              className="group flex items-end justify-start gap-1.5"
            >
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-accent/15 px-3 py-2 text-sm leading-relaxed text-foreground shadow-sm">
                <p className="whitespace-pre-wrap">{note.text}</p>
                <p className="mt-1 font-mono text-[0.65rem] text-muted">
                  {note.at}
                  {filter === "all" ? ` · ${note.channelName}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  title="Copy note"
                  aria-label="Copy note"
                  className="rounded border border-border bg-background p-1 text-muted hover:text-accent"
                  onClick={() => void copyNote(note)}
                >
                  {copiedKey === key ? <CheckIcon /> : <ClipboardIcon />}
                </button>
                <button
                  type="button"
                  title="Dismiss note"
                  aria-label="Dismiss note"
                  className="rounded border border-border bg-background p-1 text-muted hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => void dismissNote(note)}
                  disabled={busy}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        })}
        {error && (
          <p className="font-mono text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <select
          value={composeChannel?.id ?? ""}
          onChange={(e) => setComposeChannelId(e.target.value || null)}
          className="shrink-0 rounded border border-border bg-background px-1.5 py-1 font-mono text-[0.7rem] outline-none focus:border-accent"
          disabled={channels.length === 0}
        >
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {channelDisplayName(ch)}
            </option>
          ))}
        </select>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Note to self…"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim() || !composeChannel}
          className="shrink-0 rounded-full bg-accent px-3 py-1.5 font-mono text-[0.7rem] font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="5"
        y="3.5"
        width="8"
        height="10"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M3.5 11.5V2.5h7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 4.5h9M6 4.5V3h4v1.5M5.5 4.5l.5 9h4l.5-9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
