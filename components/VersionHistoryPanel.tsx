"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listDocumentRevisions,
  type DocumentRevision,
} from "@/lib/workspace/api";
import { compactDiff, unifiedLineDiff, type DiffLine } from "@/lib/markdown/diff";
import { toastCopyFromError } from "@/lib/ui/toastCopy";

type Props = {
  open: boolean;
  onClose: () => void;
  nodeId: string | null;
  /** Restore the given revision into the editor (throws on failure). */
  onRestore: (version: number) => Promise<void>;
  /** Current editor markdown, for diffs against a snapshot. */
  currentMarkdown?: string | null;
  getCurrentMarkdown?: () => string;
};

/** A restore failure whose message is already written for the reader. */
export class RestoreMessage extends Error {}

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

function DiffPreview({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) {
    return <p className="settings-help mt-2">No differences.</p>;
  }
  return (
    <pre className="lossy-diff mt-2 max-h-56 overflow-auto rounded border border-border bg-panel p-2 font-mono text-[0.7rem] leading-snug">
      {lines.map((line, index) => (
        <div
          key={`${index}-${line.type}`}
          className={
            line.type === "add"
              ? "lossy-diff-add"
              : line.type === "remove"
                ? "lossy-diff-remove"
                : ""
          }
        >
          {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
          {line.text}
        </div>
      ))}
    </pre>
  );
}

export function VersionHistoryPanel({
  open,
  onClose,
  nodeId,
  onRestore,
  currentMarkdown = null,
  getCurrentMarkdown,
}: Props) {
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Raw server / engine text behind a friendly error, shown under Details. */
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
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
        toastCopyFromError(err, "Could not load version history.").message
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
      setCompareVersion(null);
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

  // One diff per opened comparison, not one per re-render (each render would
  // re-serialize the essay and redo the LCS).
  const compareMarkdown =
    compareVersion != null
      ? (revisions.find((rev) => rev.version === compareVersion)?.markdown ?? null)
      : null;
  const compareLines = useMemo(() => {
    if (compareMarkdown == null) return null;
    const current = currentMarkdown ?? getCurrentMarkdown?.() ?? "";
    return compactDiff(unifiedLineDiff(compareMarkdown, current), 2);
    // getCurrentMarkdown is read once per comparison on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMarkdown, currentMarkdown]);

  if (!open || !nodeId) return null;

  async function restore(version: number) {
    setRestoringVersion(version);
    setError(null);
    setErrorDetail(null);
    try {
      await onRestore(version);
      setRestoredVersion(version);
      setConfirmVersion(null);
      await load();
    } catch (err) {
      const friendly = `Couldn't restore version ${version}. Your current essay wasn't changed.`;
      // Our own messages (quota, missing version) read fine as they are.
      // Server errors (plain Supabase objects) and engine errors go under
      // Details instead of being shown raw.
      const copy = toastCopyFromError(err, friendly);
      if (err instanceof RestoreMessage) {
        setError(err.message);
      } else {
        setError(friendly);
        setErrorDetail(copy.detail ?? (copy.technical ? null : copy.message));
      }
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
            always reversible. Use Diff to compare a snapshot to the current
            essay.
          </p>

          {error && (
            <div role="alert" className="text-sm text-red-600 dark:text-red-400">
              <p>{error}</p>
              {errorDetail && (
                <details className="mt-1 text-xs text-muted">
                  <summary className="cursor-pointer">Details</summary>
                  <p className="mt-1 font-mono break-words">{errorDetail}</p>
                </details>
              )}
            </div>
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
                    {(currentMarkdown != null || getCurrentMarkdown) && (
                      <button
                        type="button"
                        className="rounded border border-border px-2 py-0.5 text-xs hover:bg-panel"
                        onClick={() =>
                          setCompareVersion((current) =>
                            current === rev.version ? null : rev.version
                          )
                        }
                      >
                        {compareVersion === rev.version ? "Hide diff" : "Diff"}
                      </button>
                    )}
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
                {compareVersion === rev.version && compareLines && (
                  <DiffPreview lines={compareLines} />
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
