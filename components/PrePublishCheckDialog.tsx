"use client";

import { useEffect, useId } from "react";
import type { PrePublishReport } from "@/lib/preview/runPrePublishCheck";

export function PrePublishCheckDialog({
  open,
  busy,
  report,
  error,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  report: PrePublishReport | null;
  error: string | null;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex max-h-[min(36rem,85vh)] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold">
            Pre-publish check
          </h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-muted hover:bg-panel hover:text-foreground"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
          {busy && (
            <p className="text-muted">Checking links and images…</p>
          )}
          {!busy && error && (
            <p className="text-red-600 dark:text-red-400">{error}</p>
          )}
          {!busy && report && (
            <>
              <p className="mb-3 text-xs text-muted">
                Checked {report.checked} http(s) URL
                {report.checked === 1 ? "" : "s"}
                {report.failed > 0
                  ? ` · ${report.failed} failed`
                  : report.checked > 0
                    ? " · all ok"
                    : ""}
                {report.skipped > 0
                  ? ` · ${report.skipped} skipped / relative`
                  : ""}
                . BlogIDE Storage assets are already public by URL; promoting
                from a private bucket is a later Storage-track item.
              </p>
              {report.rows.length === 0 ? (
                <p className="text-muted">No links or images found.</p>
              ) : (
                <ul className="space-y-2">
                  {report.rows.map((row) => (
                    <li
                      key={`${row.kind}:${row.url}`}
                      className="rounded border border-border px-2.5 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <StatusBadge ok={row.ok} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[0.7rem]">
                            {row.url}
                          </div>
                          <div className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-muted">
                            {row.kind}
                            {row.status != null ? ` · HTTP ${row.status}` : ""}
                          </div>
                          {(row.error || row.note) && (
                            <div className="mt-0.5 text-xs text-muted">
                              {row.error || row.note}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <footer className="border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === true) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-emerald-700 dark:text-emerald-400">
        OK
      </span>
    );
  }
  if (ok === false) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:text-red-400">
        Fail
      </span>
    );
  }
  return (
    <span className="mt-0.5 shrink-0 rounded bg-panel px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted">
      Skip
    </span>
  );
}
