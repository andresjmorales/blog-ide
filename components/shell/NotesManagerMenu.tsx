"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  channelDisplayName,
  listInboxChannels,
} from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

type Props = {
  nodes: WorkspaceNode[];
  onNewChannel: () => void;
  onOpenChannelDoc: (channelId: string) => void;
  onRenameChannel: (channelId: string) => void;
  onTrashChannel: (channelId: string) => void;
};

type Submenu = "open" | "rename" | "trash" | null;

/**
 * Files-style manager control for Notes channels (create / open doc / rename /
 * trash). Channel markdown is intentionally not listed in the Files tree.
 * Channel pickers expand inline so the menu stays inside a narrow right dock.
 */
export function NotesManagerMenu({
  nodes,
  onNewChannel,
  onOpenChannelDoc,
  onRenameChannel,
  onTrashChannel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const channels = listInboxChannels(nodes);

  function closeMenu() {
    setOpen(false);
    setSubmenu(null);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (submenu) setSubmenu(null);
      else closeMenu();
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) closeMenu();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, submenu]);

  function pickChannel(
    action: (channelId: string) => void,
    channelId: string
  ) {
    action(channelId);
    closeMenu();
  }

  return (
    <div className="relative ml-auto" ref={rootRef}>
      <button
        type="button"
        className="explorer-toolbar-btn"
        title="Notes manager"
        aria-label="Notes manager"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (open) closeMenu();
          else setOpen(true);
        }}
      >
        <NotesManagerIcon />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 max-h-[min(22rem,calc(100dvh-6rem))] w-[min(14rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border bg-background py-1 text-sm shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center px-3 py-1.5 text-left hover:bg-panel"
            onClick={() => {
              onNewChannel();
              closeMenu();
            }}
          >
            New channel
          </button>
          <ChannelSubmenu
            label="Open channel doc"
            channels={channels}
            active={submenu === "open"}
            onToggle={() =>
              setSubmenu((s) => (s === "open" ? null : "open"))
            }
            onPick={(id) => pickChannel(onOpenChannelDoc, id)}
            emptyHint="No channels yet"
          />
          <ChannelSubmenu
            label="Rename channel"
            channels={channels}
            active={submenu === "rename"}
            onToggle={() =>
              setSubmenu((s) => (s === "rename" ? null : "rename"))
            }
            onPick={(id) => pickChannel(onRenameChannel, id)}
            emptyHint="No channels yet"
          />
          <ChannelSubmenu
            label="Move channel to Trash"
            channels={channels}
            active={submenu === "trash"}
            onToggle={() =>
              setSubmenu((s) => (s === "trash" ? null : "trash"))
            }
            onPick={(id) => pickChannel(onTrashChannel, id)}
            emptyHint="No channels yet"
            danger
          />
        </div>
      )}
    </div>
  );
}

function ChannelSubmenu({
  label,
  channels,
  active,
  onToggle,
  onPick,
  emptyHint,
  danger = false,
}: {
  label: string;
  channels: WorkspaceNode[];
  active: boolean;
  onToggle: () => void;
  onPick: (channelId: string) => void;
  emptyHint: string;
  danger?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        role="menuitem"
        aria-expanded={active}
        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-panel ${
          danger ? "text-red-600 dark:text-red-400" : ""
        }`}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span className="text-[0.65rem] text-muted" aria-hidden>
          {active ? "▾" : "▸"}
        </span>
      </button>
      {active && (
        <div role="group" className="border-y border-border/60 bg-panel/40 py-0.5">
          {channels.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-muted">{emptyHint}</p>
          ) : (
            channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                role="menuitem"
                className={`flex w-full items-center px-3 py-1.5 pl-5 text-left hover:bg-panel ${
                  danger ? "text-red-600 dark:text-red-400" : ""
                }`}
                onClick={() => onPick(ch.id)}
              >
                {channelDisplayName(ch)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NotesManagerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 2.5h6l3 3V13a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 2.5V5.5H12.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M5 8.5h6M5 11h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
