"use client";

import { ShellChat } from "@/components/shell/ShellChat";
import { openShellPin } from "@/lib/pins/pinStore";
import type { WorkspaceNode } from "@/lib/workspace/types";

type Props = {
  nodes: WorkspaceNode[];
  height: number;
  onResizeStart: () => void;
  onClose: () => void;
  onPopOut: () => void;
  refreshKey?: number | string;
  onNotesChanged?: () => void;
};

/** Docked like Cursor's terminal: full width of the center column only. */
export function ShellPanel({
  nodes,
  height,
  onResizeStart,
  onClose,
  onPopOut,
  refreshKey,
  onNotesChanged,
}: Props) {
  return (
    <div
      className="flex w-full shrink-0 flex-col border-t border-border bg-panel/95"
      style={{ height }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={onResizeStart}
        className="h-1 cursor-row-resize hover:bg-accent/40"
      />
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-muted">
          Shell
        </span>
        <span className="font-mono text-[0.65rem] text-muted">
          notes to self
        </span>
        <button
          type="button"
          className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[0.65rem] text-muted hover:border-accent hover:text-accent"
          onClick={() => {
            openShellPin();
            onPopOut();
          }}
          title="Pop out Shell"
        >
          Pop out
        </button>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 font-mono text-[0.65rem] text-muted hover:text-foreground"
          onClick={onClose}
          title="Close Shell"
        >
          ✕
        </button>
      </div>
      <ShellChat
        nodes={nodes}
        refreshKey={refreshKey}
        onNotesChanged={onNotesChanged}
      />
    </div>
  );
}
