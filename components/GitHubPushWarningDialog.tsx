"use client";

import { useEffect, useState } from "react";
import type { GithubPushIssue } from "@/lib/github/status";

export type GithubPushRemap = {
  nodeId: string;
  path: string;
  repo: string;
  branch: string;
};

type Props = {
  open: boolean;
  issues: GithubPushIssue[];
  busy?: boolean;
  onClose: () => void;
  onPushAnyway: () => void;
  onRemapAndPush: (updates: GithubPushRemap[]) => void;
};

function initialPushPaths(issues: GithubPushIssue[]) {
  const next: Record<string, string> = {};
  for (const issue of issues) {
    next[issue.nodeId || issue.plannedPath] =
      issue.candidates[0] ?? issue.plannedPath;
  }
  return next;
}

export function GitHubPushWarningDialog({
  open,
  issues,
  busy = false,
  onClose,
  onPushAnyway,
  onRemapAndPush,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <GitHubPushWarningForm
      key={issues.map((issue) => issue.nodeId || issue.plannedPath).join("|")}
      issues={issues}
      busy={busy}
      onClose={onClose}
      onPushAnyway={onPushAnyway}
      onRemapAndPush={onRemapAndPush}
    />
  );
}

function GitHubPushWarningForm({
  issues,
  busy,
  onClose,
  onPushAnyway,
  onRemapAndPush,
}: Omit<Props, "open">) {
  const [paths, setPaths] = useState(() => initialPushPaths(issues));

  const remaps: GithubPushRemap[] = issues
    .filter((issue) => issue.nodeId)
    .map((issue) => ({
      nodeId: issue.nodeId,
      path:
        paths[issue.nodeId] ??
        paths[issue.plannedPath] ??
        issue.candidates[0] ??
        issue.plannedPath,
      repo: issue.repo,
      branch: issue.branch,
    }))
    .filter((row) => row.path);

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close GitHub push warning"
        onClick={busy ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-push-warn-title"
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id="github-push-warn-title">File moved on GitHub</h2>
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <section className="settings-section">
          <p className="settings-help">
            A mapped file is gone from its old path but still exists elsewhere
            in the repo (for example after a local <code>git mv</code>). Pushing
            to the old path would recreate it and leave a duplicate. Update the
            mapping, or push anyway.
          </p>
          <ul className="mb-3 list-none space-y-2 p-0 text-xs">
            {issues.map((issue) => {
              const key = issue.nodeId || issue.plannedPath;
              return (
                <li key={key} className="rounded border border-border px-2 py-1.5">
                  <div className="font-medium">{issue.plannedPath}</div>
                  <label className="mt-1 flex items-center gap-2 text-muted">
                    Push to
                    <select
                      className="settings-text-input max-w-full"
                      value={paths[key] ?? issue.candidates[0]}
                      onChange={(e) =>
                        setPaths((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    >
                      {issue.candidates.map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {candidate}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              disabled={busy}
              className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-panel disabled:opacity-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-amber-500/60 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300"
              onClick={onPushAnyway}
            >
              {busy ? "Pushing…" : "Push anyway (may duplicate)"}
            </button>
            <button
              type="button"
              disabled={busy || remaps.length === 0}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              onClick={() => onRemapAndPush(remaps)}
            >
              {busy ? "Pushing…" : "Update mapping and push"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
