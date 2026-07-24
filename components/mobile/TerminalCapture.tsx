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

const ALL_CHANNELS = "__all__";

type Props = {
  nodes: WorkspaceNode[];
  displayName: string;
  onEnterApp: () => void;
  onRefreshTree?: () => Promise<void> | void;
  /** Bump to reload persisted history (e.g. after sync). */
  refreshKey?: number | string;
};

/** Keep the shell framed to the visible viewport (handles mobile keyboard). */
function useVisualViewportFrame() {
  const [frame, setFrame] = useState(() => ({
    height:
      typeof window !== "undefined"
        ? (window.visualViewport?.height ?? window.innerHeight)
        : 0,
    offsetTop: 0,
  }));

  useEffect(() => {
    const vv = window.visualViewport;
    const sync = () => {
      setFrame({
        height: vv?.height ?? window.innerHeight,
        offsetTop: vv?.offsetTop ?? 0,
      });
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return frame;
}

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
  /** User override; null means derive from localStorage / default channel. */
  const [channelOverride, setChannelOverride] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const frame = useVisualViewportFrame();

  const rememberedId = loadLastCaptureChannelId();
  const preferredId =
    channelOverride ??
    (rememberedId && channels.some((c) => c.id === rememberedId)
      ? rememberedId
      : null);

  const sendToAll = preferredId === ALL_CHANNELS;
  const activeChannel = sendToAll
    ? defaultChannel
    : (channels.find((c) => c.id === preferredId) ?? defaultChannel);
  const selectValue = sendToAll
    ? ALL_CHANNELS
    : (activeChannel?.id ?? "");

  // Prevent the document from scrolling under the shell (esp. with keyboard).
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

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
    // Defer so the async loader's initial setState is not sync-in-effect.
    const id = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadHistory, refreshKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length, activeChannel?.id]);

  async function send() {
    const text = input.trim();
    const targets = sendToAll
      ? channels
      : activeChannel
        ? [activeChannel]
        : [];
    if (!text || busy || targets.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const at = new Date();
      for (const channel of targets) {
        await appendQuickNote({ channelNodeId: channel.id, text, at });
      }
      if (!sendToAll && activeChannel) {
        saveLastCaptureChannelId(activeChannel.id);
      }
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
    <div
      className="fixed inset-x-0 top-0 z-40 flex flex-col bg-[var(--background)] text-foreground"
      style={{
        height: frame.height || "100dvh",
        transform:
          frame.offsetTop > 0
            ? `translateY(${frame.offsetTop}px)`
            : undefined,
      }}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 80% at 10% 0%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in oklab, var(--panel) 90%, var(--background)), var(--background))",
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur-sm">
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
                {displayName}@notes
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

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 font-mono text-xs leading-relaxed"
        >
          <p className="text-muted">
            <span className="text-accent">$</span> notes to self. History looks
            like prior commands. The desktop Notes panel shows the same stream.
          </p>
          <div className="mt-4 space-y-3">
            {loading && history.length === 0 && (
              <p className="text-muted/80"># loading history…</p>
            )}
            {!loading && history.length === 0 && (
              <p className="text-muted/80"># no history yet. Type below</p>
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
          className="shrink-0 border-t border-border bg-panel/95 p-3 backdrop-blur-sm"
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
              value={selectValue}
              onChange={(e) => {
                const value = e.target.value;
                setChannelOverride(value);
                if (value && value !== ALL_CHANNELS) {
                  saveLastCaptureChannelId(value);
                }
              }}
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-xs outline-none focus:border-accent"
              disabled={channels.length === 0}
            >
              {channels.length === 0 ? (
                <option value="">No channels yet</option>
              ) : (
                <>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {channelDisplayName(ch)}
                    </option>
                  ))}
                  {channels.length > 1 && (
                    <option value={ALL_CHANNELS}>All channels</option>
                  )}
                </>
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
              disabled={
                busy ||
                !input.trim() ||
                (sendToAll ? channels.length === 0 : !activeChannel)
              }
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
