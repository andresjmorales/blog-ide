"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listDocumentRevisions,
  type DocumentRevision,
} from "@/lib/workspace/api";

type Props = {
  open: boolean;
  onClose: () => void;
  nodeId: string | null;
  /** Restore the given revision into the editor (throws on failure). */
  onRestore: (version: number) => Promise<void>;
};

function formatStamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(markdown: string): string {
  const bytes = new TextEncoder().encode(markdown).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function VersionHistoryPanel({ open, onClose, nodeId, onRestore }: Props) {
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [restoredVersion, setRestoredVersion] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!nodeId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listDocumentRevisions(nodeId);
      setRevisions(list);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load version history."
      );
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    if (!open) return;
    // Defer so we don't sync-setState inside the effect body (eslint).
    const timer = window.setTimeout(() => {
      setPreviewVersion(null);
      setConfirmVersion(null);
      setRestoredVersion(null);
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !nodeId) return null;

  async function restore(version: number) {
    setRestoringVersion(version);
    setError(null);
    try {
      await onRestore(version);
      setRestoredVersion(version);
      setConfirmVersion(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoringVersion(null);
    }
  }

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close version history"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id="version-history-title">Version history</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <section className="settings-section">
          <p className="settings-help">
            The last {revisions.length > 0 ? revisions.length : 20} saved
            versions of this essay, snapshotted in the cloud on every sync.
            Restoring snapshots the current version first, so a restore is
            always reversible.
          </p>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {restoredVersion != null && !error && (
            <p role="status" className="settings-help">
              Restored version {restoredVersion}. The replaced content is the
              newest entry below.
            </p>
          )}
          {loading && <p className="settings-help">Loading versions…</p>}
          {!loading && revisions.length === 0 && !error && (
            <p className="settings-help">
              No snapshots yet. They appear after the next cloud sync of an
              edit.
            </p>
          )}

          <ul className="m-0 list-none p-0">
            {revisions.map((rev) => (
              <li
                key={rev.version}
                className="border-b border-border py-2 last:border-b-0"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">v{rev.version}</span>
                  <span className="text-muted">
                    {formatStamp(rev.created_at)} · {formatSize(rev.markdown)}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                      onClick={() =>
                        setPreviewVersion((current) =>
                          current === rev.version ? null : rev.version
                        )
                      }
                    >
                      {previewVersion === rev.version ? "Hide" : "Preview"}
                    </button>
                    {confirmVersion === rev.version ? (
                      <>
                        <button
                          type="button"
                          disabled={restoringVersion != null}
                          className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                          onClick={() => void restore(rev.version)}
                        >
                          {restoringVersion === rev.version
                            ? "Restoring…"
                            : "Confirm restore"}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                          onClick={() => setConfirmVersion(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={restoringVersion != null}
                        className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel disabled:opacity-50"
                        onClick={() => setConfirmVersion(rev.version)}
                      >
                        Restore
                      </button>
                    )}
                  </span>
                </div>
                {previewVersion === rev.version && (
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-border bg-panel p-2 font-mono text-xs leading-snug">
                    {rev.markdown}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
