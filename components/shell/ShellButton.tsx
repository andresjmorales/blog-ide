"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { subscribeShellSeen } from "@/lib/capture/seen";
import { countUnreadCaptureNotes } from "@/lib/capture/unread";
import {
  getPinWindows,
  subscribePinWindows,
} from "@/lib/pins/pinStore";
import type { WorkspaceNode } from "@/lib/workspace/types";

type Props = {
  nodes: WorkspaceNode[];
  dockOpen: boolean;
  onClick: () => void;
  refreshKey?: number | string;
};

const EMPTY: ReturnType<typeof getPinWindows> = [];

export function ShellButton({
  nodes,
  dockOpen,
  onClick,
  refreshKey,
}: Props) {
  const [unread, setUnread] = useState(0);
  const windows = useSyncExternalStore(
    subscribePinWindows,
    getPinWindows,
    () => EMPTY
  );
  const pinOpen = windows.some((w) => w.kind === "shell");
  const active = dockOpen || pinOpen;

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const n = await countUnreadCaptureNotes(nodes);
      if (!cancelled) setUnread(n);
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [nodes, refreshKey]);

  useEffect(
    () =>
      subscribeShellSeen(() => {
        void countUnreadCaptureNotes(nodes).then(setUnread);
      }),
    [nodes]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      title={
        unread > 0
          ? `Shell · ${unread} unread note${unread === 1 ? "" : "s"}`
          : "Shell · notes to self"
      }
      className={`relative inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[0.65rem] uppercase tracking-wider ${
        active
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-border text-muted hover:border-accent/40 hover:text-foreground"
      }`}
    >
      <TerminalIcon />
      Shell
      {unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[0.55rem] font-semibold normal-case tracking-normal text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

function TerminalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M4 6.5 6.2 8.5 4 10.5M8.5 10.5h3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
