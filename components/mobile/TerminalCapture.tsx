"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendQuickNote } from "@/lib/capture/appendQuickNote";
import { parseCaptureNotes, type CaptureNote } from "@/lib/capture/format";
import {
  loadLastCaptureChannelId,
  saveLastCaptureChannelId,
} from "@/lib/capture/mobileSurface";
import { markShellSeen } from "@/lib/capture/seen";
import { openDocument } from "@/lib/sync/engine";
import {
  channelDisplayName,
  getNotesChannel,
  listInboxChannels,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

type HistoryLine = CaptureNote & {
  channelName: string;
};

type Props = {
  nodes: WorkspaceNode[];
  displayName: string;
  onEnterApp: () => void;
  onRefreshTree?: () => Promise<void> | void;
  /** Bump to reload persisted history (e.g. after sync). */
  refreshKey?: number | string;
};

export function TerminalCapture({
  nodes,
  displayName,
  onEnterApp,
  onRefreshTree,
  refreshKey,
}: Props) {
  const channels = useMemo(() => listInboxChannels(nodes), [nodes]);
  const defaultChannel = useMemo(
    () => getNotesChannel(nodes) ?? channels[0] ?? null,
    [nodes, channels]
  );
  const [channelId, setChannelId] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const remembered = loadLastCaptureChannelId();
    if (remembered && channels.some((c) => c.id === remembered)) {
      setChannelId(remembered);
      return;
    }
    if (defaultChannel) setChannelId(defaultChannel.id);
  }, [channels, defaultChannel]);

  const activeChannel =
    channels.find((c) => c.id === channelId) ?? defaultChannel;

  const loadHistory = useCallback(async () => {
    if (!activeChannel) {
      setHistory([]);
      return;
    }
    setLoading(true);
    try {
      const opened = await openDocument(activeChannel.id);
      const name = channelDisplayName(activeChannel);
      const lines = parseCaptureNotes(opened.markdown).map((note) => ({
        ...note,
        channelName: name,
      }));
      lines.sort((a, b) => {
        if (a.atMs !== b.atMs) return a.atMs - b.atMs;
        return a.at.localeCompare(b.at);
      });
      setHistory(lines);
      const newest = lines.reduce((max, n) => Math.max(max, n.atMs), 0);
      markShellSeen(Math.max(Date.now(), newest));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [activeChannel]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, refreshKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length, channelId]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !activeChannel) return;
    setBusy(true);
    setError(null);
    try {
      await appendQuickNote({ channelNodeId: activeChannel.id, text });
      saveLastCaptureChannelId(activeChannel.id);
      setInput("");
      await onRefreshTree?.();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)] text-foreground">
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 80% at 10% 0%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in oklab, var(--panel) 90%, var(--background)), var(--background))",
        }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/blogide.svg"
              alt=""
              width={22}
              height={22}
              className="size-[22px] shrink-0"
              draggable={false}
            />
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-semibold tracking-tight">
                BlogIDE<span className="text-accent">::</span>shell
              </p>
              <p className="truncate font-mono text-[0.65rem] text-muted">
                {displayName}@inbox
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onEnterApp}
            className="shrink-0 rounded border border-border bg-panel px-2.5 py-1.5 font-mono text-[0.7rem] text-foreground hover:border-accent hover:text-accent"
          >
            Enter full app
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 font-mono text-xs leading-relaxed">
          <p className="text-muted">
            <span className="text-accent">$</span> notes to self — history looks
            like prior commands. Desktop Shell shows the same stream.
          </p>
          <div className="mt-4 space-y-3">
            {loading && history.length === 0 && (
              <p className="text-muted/80"># loading history…</p>
            )}
            {!loading && history.length === 0 && (
              <p className="text-muted/80"># no history yet — type below</p>
            )}
            {history.map((line, i) => (
              <div
                key={`${line.at}-${line.text}-${i}`}
                className="space-y-0.5"
              >
                <p className="whitespace-pre-wrap">
                  <span className="text-accent">$</span>{" "}
                  <span className="text-muted">note</span>{" "}
                  <span className="text-foreground">{line.text}</span>
                </p>
                <p className="pl-3 text-[0.65rem] text-muted">
                  # ok · {line.at} · {line.channelName}
                </p>
              </div>
            ))}
          </div>
          {error && (
            <p className="mt-3 text-red-600 dark:text-red-400">{error}</p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="border-t border-border bg-panel/80 p-3 backdrop-blur-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <label className="font-mono text-[0.65rem] uppercase tracking-wider text-muted">
              Channel
            </label>
            <select
              value={activeChannel?.id ?? ""}
              onChange={(e) => {
                setChannelId(e.target.value);
                saveLastCaptureChannelId(e.target.value);
              }}
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:border-accent"
              disabled={channels.length === 0}
            >
              {channels.length === 0 ? (
                <option value="">No channels yet</option>
              ) : (
                channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {channelDisplayName(ch)}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <span className="mb-2 shrink-0 font-mono text-sm text-accent">
              ›
            </span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="note to future you…"
              className="min-h-[2.75rem] w-full resize-none rounded border border-border bg-background px-2.5 py-2 font-mono text-sm outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim() || !activeChannel}
              className="mb-0.5 shrink-0 rounded bg-accent px-3 py-2 font-mono text-xs font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
