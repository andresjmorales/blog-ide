"use client";

import { useEffect, useMemo, useState } from "react";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import type { GithubPullFile } from "@/lib/github/pull";

export type GithubPullApply = {
  files: Array<{
    nodeId: string;
    markdown: string;
    pullPath: string;
    mappedPath: string;
    repo: string;
    branch: string;
    updateMapping: boolean;
  }>;
};

type Props = {
  open: boolean;
  files: GithubPullFile[];
  unmapped?: Array<{ repo: string; branch: string; path: string }>;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onApply: (result: GithubPullApply) => void;
};

function initialPullState(files: GithubPullFile[]) {
  const paths: Record<string, string> = {};
  const selected: Record<string, boolean> = {};
  for (const file of files) {
    paths[file.nodeId] = file.pullPath;
    const remote = file.remotes[file.pullPath] ?? null;
    selected[file.nodeId] = remote != null && !file.identical;
  }
  const activeId =
    files.find((f) => (f.remotes[f.pullPath] ?? null) && !f.identical)
      ?.nodeId ??
    files[0]?.nodeId ??
    null;
  return { paths, selected, activeId };
}

export function GitHubPullDialog({
  open,
  files,
  unmapped = [],
  busy = false,
  error = null,
  onClose,
  onApply,
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
    <GitHubPullForm
      key={files.map((file) => `${file.nodeId}:${file.pullPath}`).join("|")}
      files={files}
      unmapped={unmapped}
      busy={busy}
      error={error}
      onClose={onClose}
      onApply={onApply}
    />
  );
}

function GitHubPullForm({
  files,
  unmapped = [],
  busy,
  error,
  onClose,
  onApply,
}: Omit<Props, "open">) {
  const initial = initialPullState(files);
  const [paths, setPaths] = useState(initial.paths);
  const [selected, setSelected] = useState(initial.selected);
  const [updateMaps, setUpdateMaps] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);

  const active = files.find((f) => f.nodeId === activeId) ?? files[0];
  const activePath = active
    ? (paths[active.nodeId] ?? active.pullPath)
    : "";
  const activeRemote = active ? (active.remotes[activePath] ?? null) : null;

  const diff = useMemo(() => {
    if (!active || activeRemote == null) return [];
    return compactDiff(
      unifiedLineDiff(active.localMarkdown, activeRemote),
      3
    );
  }, [active, activeRemote]);

  const applyCount = files.filter((file) => {
    const path = paths[file.nodeId] ?? file.pullPath;
    return selected[file.nodeId] && (file.remotes[path] ?? null) != null;
  }).length;
  const mappingUpdates = files.some(
    (file) =>
      selected[file.nodeId] &&
      (paths[file.nodeId] ?? file.pullPath) !== file.mappedPath
  );

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close GitHub pull"
        onClick={busy ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-pull-title"
        className="settings-panel"
        style={{
          width: "min(68rem, calc(100vw - 1.5rem))",
          maxHeight: "calc(100dvh - 1.5rem)",
        }}
      >
        <div className="settings-panel-header">
          <div>
            <h2 id="github-pull-title">Pull from GitHub</h2>
            <p className="mt-1 text-xs text-muted">
              Review the remote file, then replace this essay. Pull never
              creates a new BlogIDE document from GitHub.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <section className="settings-section">
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {files.length === 0 ? (
            <p className="settings-help">Nothing mapped to pull.</p>
          ) : (
            <>
              <ul className="mb-3 list-none space-y-2 p-0 text-xs">
                {files.map((file) => {
                  const path = paths[file.nodeId] ?? file.pullPath;
                  const remote = file.remotes[path] ?? null;
                  const missing = remote == null;
                  const matches =
                    remote != null && remote === file.localMarkdown;
                  return (
                    <li
                      key={file.nodeId}
                      className={`rounded border px-2 py-1.5 ${
                        file.nodeId === active?.nodeId
                          ? "border-accent"
                          : "border-border"
                      }`}
                    >
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          disabled={missing}
                          checked={Boolean(selected[file.nodeId]) && !missing}
                          onChange={(e) =>
                            setSelected((prev) => ({
                              ...prev,
                              [file.nodeId]: e.target.checked,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setActiveId(file.nodeId)}
                        >
                          <span className="font-medium">{file.label}</span>
                          <span className="mt-0.5 block text-muted">
                            {file.mappedPath}
                            {path !== file.mappedPath
                              ? ` → ${path}`
                              : ""}
                            {file.identical && path === file.pullPath
                              ? " · already matches"
                              : matches
                                ? " · already matches"
                                : missing
                                  ? " · not on GitHub"
                                  : " · differs"}
                          </span>
                          {file.workspaceTwins.length > 0 && (
                            <span className="mt-0.5 block text-amber-800 dark:text-amber-300">
                              Another BlogIDE file already uses this name:{" "}
                              {file.workspaceTwins
                                .map((twin) => twin.label)
                                .join(", ")}
                              . Pull updates this mapped essay only.
                            </span>
                          )}
                        </button>
                      </label>
                      {file.candidates.length > 0 && (
                        <label className="mt-1 flex items-center gap-2 pl-6 text-muted">
                          Pull from
                          <select
                            className="settings-text-input max-w-full"
                            value={path}
                            onChange={(e) =>
                              setPaths((prev) => ({
                                ...prev,
                                [file.nodeId]: e.target.value,
                              }))
                            }
                          >
                            {!file.candidates.includes(file.mappedPath) && (
                              <option value={file.mappedPath}>
                                {file.mappedPath} (mapped, missing)
                              </option>
                            )}
                            {file.candidates.map((candidate) => (
                              <option key={candidate} value={candidate}>
                                {candidate}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>

              {unmapped.length > 0 && (
                <p className="settings-help mb-3">
                  GitHub also has {unmapped.length} markdown file
                  {unmapped.length === 1 ? "" : "s"} under a mapped folder that
                  {unmapped.length === 1 ? " isn't" : " aren't"} in BlogIDE
                  ({unmapped
                    .slice(0, 4)
                    .map((row) => row.path)
                    .join(", ")}
                  {unmapped.length > 4 ? ", …" : ""}). Pull will not import
                  {unmapped.length === 1 ? " it" : " them"} as a new essay.
                </p>
              )}

              {active && (
                <div>
                  <h3>Changes</h3>
                  <p className="settings-help">
                    Red lines are in BlogIDE only; green lines are on GitHub.
                    Showing {active.label}.
                  </p>
                  {activeRemote == null ? (
                    <p className="settings-help">
                      That path is not in the repo. If you moved the file in
                      git, pick the new path above, or remap it.
                    </p>
                  ) : diff.length === 0 ? (
                    <p className="settings-help">No line-level differences.</p>
                  ) : (
                    <pre className="lossy-diff mt-2 max-h-56 overflow-auto rounded border border-border bg-panel p-2 font-mono text-[0.7rem] leading-snug">
                      {diff.map((line, index) => (
                        <div
                          key={`${line.type}-${index}`}
                          className={
                            line.type === "add"
                              ? "lossy-diff-add"
                              : line.type === "remove"
                                ? "lossy-diff-remove"
                                : "text-muted"
                          }
                        >
                          {line.type === "add"
                            ? `+ ${line.text}`
                            : line.type === "remove"
                              ? `- ${line.text}`
                              : `  ${line.text}`}
                        </div>
                      ))}
                    </pre>
                  )}
                </div>
              )}

              {mappingUpdates && (
                <label className="mt-3 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={updateMaps}
                    onChange={(e) => setUpdateMaps(e.target.checked)}
                  />
                  Update GitHub mappings to the paths you pull from
                </label>
              )}

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
                  disabled={busy || applyCount === 0}
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  onClick={() => {
                    const next: GithubPullApply["files"] = [];
                    for (const file of files) {
                      const pullPath = paths[file.nodeId] ?? file.pullPath;
                      const markdown = file.remotes[pullPath] ?? null;
                      if (!selected[file.nodeId] || markdown == null) {
                        continue;
                      }
                      next.push({
                        nodeId: file.nodeId,
                        markdown,
                        pullPath,
                        mappedPath: file.mappedPath,
                        repo: file.repo,
                        branch: file.branch,
                        updateMapping: updateMaps && pullPath !== file.mappedPath,
                      });
                    }
                    onApply({ files: next });
                  }}
                >
                  {busy
                    ? "Applying…"
                    : applyCount === 0
                      ? "Nothing to apply"
                      : `Replace with GitHub (${applyCount})`}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
