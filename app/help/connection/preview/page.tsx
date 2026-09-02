"use client";

import { useState } from "react";
import { WorkspaceConnectionDialog } from "@/components/WorkspaceConnectionDialog";
import type { WorkspaceFailureKind } from "@/lib/workspace/connectionError";

const KINDS: WorkspaceFailureKind[] = [
  "network",
  "auth",
  "schema",
  "unknown",
];

/**
 * Local / staging preview of the blocking connection dialog.
 * Visit `/help/connection/preview` (not linked from production chrome).
 */
export default function ConnectionDialogPreviewPage() {
  const [kind, setKind] = useState<WorkspaceFailureKind>("network");
  const [open, setOpen] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [retryInSec, setRetryInSec] = useState<number | null>(8);

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      {/* Fake editor chrome behind the overlay */}
      <header className="flex h-11 items-center justify-between border-b border-border px-3 text-xs text-muted">
        <span>Panels</span>
        <span className="font-semibold text-foreground">BlogIDE</span>
        <span>Synced · menu</span>
      </header>
      <div className="flex min-h-[calc(100dvh-2.75rem)]">
        <aside className="w-56 border-r border-border p-3 text-sm text-muted">
          <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-wider">
            Files
          </p>
          <p>essays/</p>
          <p>drafts/</p>
          <p className="text-foreground">scratchpad.md</p>
        </aside>
        <main className="flex-1 p-8 opacity-40">
          <p className="text-3xl font-semibold tracking-tight">Untitled</p>
          <p className="mt-4 text-muted">
            Dimmed editor chrome behind the connection dialog…
          </p>
        </main>
      </div>

      <div className="fixed bottom-4 left-4 z-[90] flex flex-wrap gap-2 rounded-md border border-border bg-background p-2 text-xs shadow-md">
        <label className="flex items-center gap-1">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as WorkspaceFailureKind)}
            className="rounded border border-border bg-panel px-1 py-0.5"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="blogide-chrome-btn"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide dialog" : "Show dialog"}
        </button>
        <button
          type="button"
          className="blogide-chrome-btn"
          onClick={() => setRetrying((v) => !v)}
        >
          Retrying: {retrying ? "on" : "off"}
        </button>
        <button
          type="button"
          className="blogide-chrome-btn"
          onClick={() => setRetryInSec((v) => (v == null ? 8 : v > 0 ? v - 1 : 8))}
        >
          Countdown: {retryInSec ?? "off"}
        </button>
      </div>

      <WorkspaceConnectionDialog
        open={open}
        kind={kind}
        detail="TypeError: NetworkError when attempting to fetch resource."
        retrying={retrying}
        retryInSec={retryInSec}
        onContinueOffline={() => setOpen(false)}
        onRetry={() => {
          setRetrying(true);
          window.setTimeout(() => setRetrying(false), 1200);
        }}
      />
    </div>
  );
}
