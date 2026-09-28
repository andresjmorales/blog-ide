"use client";

import { useEffect, useMemo } from "react";
import { WordDiffText } from "@/components/WordDiffText";
import type { GithubPullFile } from "@/lib/github/pull";
import { unifiedLineDiff } from "@/lib/markdown/diff";
import { reviewDiff } from "@/lib/markdown/wordDiff";

type Props = {
  open: boolean;
  /** Null while the GitHub copy is loading. */
  file: GithubPullFile | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onPush: () => void;
  onPull: () => void;
};

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Read-only comparison of the open essay with its mapped GitHub file.
 * GitHub is the "before" side, so green is what a push would add.
 */
export function GitHubDiffDialog({
  open,
  file,
  loading = false,
  error = null,
  onClose,
  onRefresh,
  onPush,
  onPull,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const remote = file ? (file.remotes[file.pullPath] ?? null) : null;
  const local = file ? normalizeNewlines(file.localMarkdown) : "";

  const diff = useMemo(() => {
    if (!file || remote == null) return null;
    const before = normalizeNewlines(remote);
    if (before === local) return { rows: [], added: 0, removed: 0 };
    const lines = unifiedLineDiff(before, local);
    return {
      rows: reviewDiff(before, local, 1),
      added: lines.filter((line) => line.type === "add" && line.text.trim()).length,
      removed: lines.filter((line) => line.type === "remove" && line.text.trim())
        .length,
    };
  }, [file, remote, local]);

  if (!open) return null;

  const identical = diff != null && diff.rows.length === 0;
  const differs = diff != null && diff.rows.length > 0;

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close GitHub diff"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-diff-title"
        className="settings-panel"
        style={{
          width: "min(56rem, calc(100vw - 1.5rem))",
          maxHeight: "calc(100dvh - 1.5rem)",
        }}
      >
        <div className="settings-panel-header">
          <div className="min-w-0">
            <h2 id="github-diff-title">Compare with GitHub</h2>
            {file && (
              <p className="mt-1 truncate text-xs text-muted" title={file.pullPath}>
                {file.label} ↔ {file.repo} · {file.branch} · {file.pullPath}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <section className="settings-section">
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {loading && !file && (
            <p className="text-sm text-muted">Reading the GitHub copy…</p>
          )}
          {file && file.pullPath !== file.mappedPath && (
            <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
              {file.mappedPath} is not on GitHub; comparing with{" "}
              {file.pullPath}, which looks like the same file moved.
            </p>
          )}
          {file && remote == null && (
            <p className="text-sm">
              Not on GitHub yet. Pushing will create{" "}
              <code className="text-xs">{file.mappedPath}</code>.
            </p>
          )}
          {identical && (
            <p className="github-diff-status is-same">
              ✓ Up to date. This essay matches GitHub exactly.
            </p>
          )}
          {differs && diff && (
            <>
              <p className="github-diff-status">
                <span className="text-emerald-700 dark:text-emerald-400">
                  +{diff.added}
                </span>{" "}
                <span className="text-red-700 dark:text-red-400">
                  −{diff.removed}
                </span>{" "}
                <span className="text-muted">
                  lines. Green is only in BlogIDE (a push adds it); struck-through
                  red is only on GitHub (a push removes it, a pull brings it back).
                </span>
              </p>
              <div className="github-diff-body">
                {diff.rows.map((row, i) =>
                  row.type === "context" ? (
                    <div key={i} className="word-diff-context">
                      {row.text}
                    </div>
                  ) : (
                    <WordDiffText key={i} segments={row.segments} />
                  )
                )}
              </div>
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-40"
            disabled={loading}
            onClick={onRefresh}
          >
            {loading ? "Checking…" : "Refresh"}
          </button>
          {differs && (
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-xs hover:border-accent hover:text-accent"
              onClick={onPull}
            >
              Pull from GitHub…
            </button>
          )}
          {(differs || (file && remote == null)) && (
            <button
              type="button"
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white"
              onClick={onPush}
            >
              Push to GitHub
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
