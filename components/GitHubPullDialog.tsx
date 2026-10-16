"use client";

import { useEffect, useMemo, useState } from "react";
import { DiffViewer, LineDiffRows } from "@/components/DiffViewer";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import { describeAnchoredFootnotes } from "@/lib/markdown/footnoteAnchors";
import type {
  ConflictChoice,
  MergeChunk,
  ThreeWayMerge,
} from "@/lib/markdown/merge3";
import type { GithubPullFile } from "@/lib/github/pull";
import {
  defaultPullSelected,
  defaultPullStrategy,
  pullMerge,
  pullResultMarkdown,
  pullSituation,
  type GithubPullSituation,
  type GithubPullStrategy,
} from "@/lib/github/pullMerge";
import { alignSignedAssetUrls } from "@/lib/github/syncHistory";
import { formatRelativeSyncAge } from "@/lib/sync/engine";

export type GithubPullApply = {
  files: Array<{
    nodeId: string;
    /** What goes into BlogIDE: GitHub's file, or the merge. */
    markdown: string;
    /** GitHub's file as pulled; becomes the new sync point. */
    remoteMarkdown: string;
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
  unmapped?: Array<{
    repo: string;
    branch: string;
    path: string;
    looksLike?: string;
  }>;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onApply: (result: GithubPullApply) => void;
};

function initialPullState(files: GithubPullFile[]) {
  const paths: Record<string, string> = {};
  const selected: Record<string, boolean> = {};
  const strategies: Record<string, GithubPullStrategy> = {};
  for (const file of files) {
    paths[file.nodeId] = file.pullPath;
    selected[file.nodeId] = defaultPullSelected(file);
    strategies[file.nodeId] = defaultPullStrategy(file);
  }
  const activeId =
    files.find((f) => selected[f.nodeId])?.nodeId ??
    files.find((f) => (f.remotes[f.pullPath] ?? null) && !f.identical)
      ?.nodeId ??
    files[0]?.nodeId ??
    null;
  return { paths, selected, strategies, activeId };
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const age = formatRelativeSyncAge(iso);
  return age === "just now" ? age : `${age} ago`;
}

function fullDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

const BLOGIDE_COMMIT = /^blogide: sync /;

function situationLabel(
  situation: GithubPullSituation,
  conflicts: number
): string {
  switch (situation) {
    case "github-ahead":
      return "new on GitHub";
    case "blogide-ahead":
      return "only edited in BlogIDE since last sync";
    case "diverged":
      return conflicts > 0
        ? `edited in both · ${conflicts} overlap${conflicts === 1 ? "" : "s"}`
        : "edited in both · merges cleanly";
    case "in-sync":
      return "only image links differ";
    default:
      return "differs";
  }
}

type DiffView = "result" | "github" | "blogide";

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
  const [strategies, setStrategies] = useState(initial.strategies);
  const [choices, setChoices] = useState<
    Record<string, Record<number, ConflictChoice>>
  >({});
  const [updateMaps, setUpdateMaps] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(initial.activeId);
  const [view, setView] = useState<DiffView>("result");

  const active = files.find((f) => f.nodeId === activeId) ?? files[0];
  const activePath = active
    ? (paths[active.nodeId] ?? active.pullPath)
    : "";
  const activeRemote = active ? (active.remotes[activePath] ?? null) : null;
  const activeSituation = active
    ? pullSituation(active, activePath)
    : "no-history";
  const activeHistory =
    active && activeSituation !== "no-history" ? active.history : null;
  const activeBase = activeHistory?.base ?? null;
  const activeStrategy = active
    ? (strategies[active.nodeId] ?? "replace")
    : "replace";
  const activeChoices = active ? (choices[active.nodeId] ?? {}) : {};

  const merges = useMemo(() => {
    const out = new Map<string, ThreeWayMerge | null>();
    for (const file of files) {
      out.set(file.nodeId, pullMerge(file, paths[file.nodeId] ?? file.pullPath));
    }
    return out;
  }, [files, paths]);
  const activeMerge = active ? (merges.get(active.nodeId) ?? null) : null;

  const activeResult = active
    ? pullResultMarkdown(active, activePath, activeStrategy, activeChoices)
    : null;

  const diff = useMemo(() => {
    if (!active || activeRemote == null) return [];
    const local = active.localMarkdown;
    const base = activeBase
      ? alignSignedAssetUrls(activeBase.markdown, local)
      : null;
    if (view === "github" && base != null) {
      return compactDiff(
        unifiedLineDiff(base, alignSignedAssetUrls(activeRemote, local)),
        3
      );
    }
    if (view === "blogide" && base != null) {
      return compactDiff(unifiedLineDiff(base, local), 3);
    }
    return compactDiff(unifiedLineDiff(local, activeResult ?? activeRemote), 3);
  }, [active, activeRemote, activeBase, activeResult, view]);

  const applyCount = files.filter((file) => {
    const path = paths[file.nodeId] ?? file.pullPath;
    return selected[file.nodeId] && (file.remotes[path] ?? null) != null;
  }).length;
  const mergeCount = files.filter(
    (file) =>
      selected[file.nodeId] &&
      strategies[file.nodeId] === "merge" &&
      merges.get(file.nodeId) != null
  ).length;
  const mappingUpdates = files.some(
    (file) =>
      selected[file.nodeId] &&
      (paths[file.nodeId] ?? file.pullPath) !== file.mappedPath
  );

  function setChoice(nodeId: string, index: number, choice: ConflictChoice) {
    setChoices((prev) => ({
      ...prev,
      [nodeId]: { ...(prev[nodeId] ?? {}), [index]: choice },
    }));
  }

  const viewTabs: Array<{ id: DiffView; label: string }> = activeBase
    ? [
        { id: "result", label: "What pull changes" },
        { id: "github", label: "GitHub’s edits since sync" },
        { id: "blogide", label: "Your BlogIDE edits since sync" },
      ]
    : [];
  const shownView: DiffView = activeBase ? view : "result";

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
              Review what changed on each side since BlogIDE and GitHub last
              matched, then merge or replace. Pull never creates a new BlogIDE
              document from GitHub.
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
                            {(file.identical && path === file.pullPath) ||
                            matches
                              ? " · already matches"
                              : missing
                                ? " · not on GitHub"
                                : ` · ${situationLabel(
                                    pullSituation(file, path),
                                    merges.get(file.nodeId)?.conflicts ?? 0
                                  )}`}
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
                    .map((row) =>
                      row.looksLike
                        ? `${row.path} (looks like a move of ${row.looksLike})`
                        : row.path
                    )
                    .join(", ")}
                  {unmapped.length > 4 ? ", …" : ""}). Pull will not import
                  {unmapped.length === 1 ? " it" : " them"} as a new essay.
                </p>
              )}

              {active && activeRemote != null && !active.identical && (
                <SinceLastSync
                  file={active}
                  path={activePath}
                  situation={activeSituation}
                />
              )}

              {active && activeMerge && (
                <fieldset className="mb-3 space-y-1 text-xs">
                  <legend className="sr-only">How to pull {active.label}</legend>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      className="mt-0.5"
                      name={`pull-strategy-${active.nodeId}`}
                      checked={activeStrategy === "merge"}
                      onChange={() =>
                        setStrategies((prev) => ({
                          ...prev,
                          [active.nodeId]: "merge",
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">Merge</span>
                      <span className="text-muted">
                        {" "}
                        — keep your BlogIDE edits and add GitHub’s.
                        {activeMerge.conflicts > 0
                          ? " Pick a side where you both edited the same passage."
                          : " No passage was edited on both sides."}
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      className="mt-0.5"
                      name={`pull-strategy-${active.nodeId}`}
                      checked={activeStrategy === "replace"}
                      onChange={() =>
                        setStrategies((prev) => ({
                          ...prev,
                          [active.nodeId]: "replace",
                        }))
                      }
                    />
                    <span>
                      <span className="font-medium">Replace with GitHub</span>
                      <span className="text-muted">
                        {" "}
                        — discard your BlogIDE edits since the last sync.
                      </span>
                    </span>
                  </label>
                </fieldset>
              )}

              {active &&
                activeMerge &&
                activeStrategy === "merge" &&
                activeMerge.conflicts > 0 && (
                  <ConflictPicker
                    merge={activeMerge}
                    choices={activeChoices}
                    onChoose={(index, choice) =>
                      setChoice(active.nodeId, index, choice)
                    }
                  />
                )}

              {active && (
                <div>
                  <h3>Changes</h3>
                  {viewTabs.length > 0 && (
                    <div
                      role="tablist"
                      aria-label="Which changes to show"
                      className="diff-viewer-toolbar mb-2 justify-start"
                    >
                      {viewTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={shownView === tab.id}
                          className={shownView === tab.id ? "is-on" : undefined}
                          onClick={() => setView(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="settings-help">
                    {shownView === "github"
                      ? "Green lines were added on GitHub since the last sync; red lines were removed there."
                      : shownView === "blogide"
                        ? "Green lines were added in BlogIDE since the last sync; red lines were removed."
                        : "Red lines leave this essay; green lines come in."}{" "}
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
                    <DiffViewer title={`Changes · ${active.label}`}>
                      <LineDiffRows lines={diff} />
                    </DiffViewer>
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

              <p className="settings-help mt-3">
                The version you have now stays in Version history.
              </p>

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
                      const remoteMarkdown = file.remotes[pullPath] ?? null;
                      if (!selected[file.nodeId] || remoteMarkdown == null) {
                        continue;
                      }
                      const markdown = pullResultMarkdown(
                        file,
                        pullPath,
                        strategies[file.nodeId] ?? "replace",
                        choices[file.nodeId] ?? {}
                      );
                      if (markdown == null) continue;
                      next.push({
                        nodeId: file.nodeId,
                        markdown,
                        remoteMarkdown,
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
                      : mergeCount === applyCount
                        ? `Merge from GitHub (${applyCount})`
                        : mergeCount > 0
                          ? `Merge / replace from GitHub (${applyCount})`
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

function SinceLastSync({
  file,
  path,
  situation,
}: {
  file: GithubPullFile;
  path: string;
  situation: GithubPullSituation;
}) {
  if (file.history === undefined && path === file.pullPath) return null;
  const history = path === file.pullPath ? file.history : null;
  if (!history?.base) {
    return (
      <div className="mb-3 rounded border border-border px-3 py-2 text-xs">
        <p className="font-medium">Since last sync</p>
        <p className="mt-1 text-muted">
          {path !== file.pullPath
            ? "This path isn’t the one BlogIDE checked history for, so"
            : history === null
              ? "Couldn’t read this file’s GitHub history, so"
              : "No recent GitHub commit matches a version saved in BlogIDE, so"}{" "}
          BlogIDE can’t tell your edits from GitHub’s. Pulling replaces the
          essay with GitHub’s file; check the diff for anything of yours first.
        </p>
      </div>
    );
  }

  const { base } = history;
  const syncedAt = base.syncedAt ?? base.commit?.date ?? null;
  const commits = history.remoteCommits;

  return (
    <div className="mb-3 rounded border border-border px-3 py-2 text-xs">
      <p className="font-medium">
        Since last sync
        {syncedAt && (
          <span className="font-normal text-muted" title={fullDate(syncedAt)}>
            {" "}
            · {ago(syncedAt)}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-muted">
        {base.commit
          ? `Last matched at ${base.commit.sha.slice(0, 7)} “${base.commit.subject}”.`
          : "Last matched when you pushed or pulled on this device."}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="font-medium">On GitHub</p>
          {commits.length === 0 ? (
            <p className="text-muted">No new commits to this file.</p>
          ) : (
            <ul className="mt-0.5 list-none space-y-0.5 p-0">
              {commits.map((commit) => (
                <li key={commit.sha} className="truncate">
                  <a
                    href={commit.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono underline"
                  >
                    {commit.sha.slice(0, 7)}
                  </a>{" "}
                  {commit.subject}
                  <span className="text-muted" title={fullDate(commit.date)}>
                    {" "}
                    · {BLOGIDE_COMMIT.test(commit.subject) ? "BlogIDE" : commit.author}
                    {commit.date ? ` · ${ago(commit.date)}` : ""}
                  </span>
                </li>
              ))}
              {history.remoteCommitsTruncated && (
                <li className="text-muted">…and possibly older ones.</li>
              )}
            </ul>
          )}
        </div>
        <div>
          <p className="font-medium">In BlogIDE</p>
          <p className="text-muted">
            {history.localChanged ? (
              <>
                Edited since
                {history.localEditedAt && (
                  <span title={fullDate(history.localEditedAt)}>
                    {" "}
                    · last saved {ago(history.localEditedAt)}
                  </span>
                )}
                .
              </>
            ) : (
              "No edits since."
            )}
          </p>
        </div>
      </div>
      <p
        className={`mt-2 ${
          situation === "blogide-ahead" || situation === "diverged"
            ? "text-amber-800 dark:text-amber-300"
            : "text-muted"
        }`}
      >
        {situation === "github-ahead" &&
          "Only GitHub changed. Pulling is safe: it brings in those commits and loses nothing."}
        {situation === "blogide-ahead" &&
          "GitHub has nothing new for this essay. Pulling would only undo your BlogIDE edits — push instead."}
        {situation === "diverged" &&
          "Both sides changed. Merge keeps your BlogIDE edits and adds GitHub’s."}
        {situation === "in-sync" &&
          "Neither side has real edits; only image links were re-signed. Nothing to pull."}
      </p>
    </div>
  );
}

function ConflictPicker({
  merge,
  choices,
  onChoose,
}: {
  merge: ThreeWayMerge;
  choices: Record<number, ConflictChoice>;
  onChoose: (index: number, choice: ConflictChoice) => void;
}) {
  const conflicts = merge.chunks.filter(
    (chunk): chunk is Extract<MergeChunk, { kind: "conflict" }> =>
      chunk.kind === "conflict"
  );
  const options: Array<{ id: ConflictChoice; label: string }> = [
    { id: "local", label: "Keep BlogIDE" },
    { id: "remote", label: "Take GitHub" },
    { id: "both", label: "Keep both" },
  ];
  return (
    <div className="mb-3 text-xs">
      <h3>
        Edited on both sides ({conflicts.length} passage
        {conflicts.length === 1 ? "" : "s"})
      </h3>
      <ol className="list-none space-y-2 p-0">
        {conflicts.map((conflict, index) => {
          const choice = choices[index] ?? "local";
          return (
            <li key={index} className="rounded border border-border px-2 py-1.5">
              <div
                role="radiogroup"
                aria-label={`Passage ${index + 1}`}
                className="diff-viewer-toolbar mb-1 justify-start"
              >
                <span className="mr-1 text-muted">Passage {index + 1}:</span>
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={choice === option.id}
                    className={choice === option.id ? "is-on" : undefined}
                    onClick={() => onChoose(index, option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ConflictSide title="BlogIDE" lines={conflict.local} />
                <ConflictSide title="GitHub" lines={conflict.remote} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ConflictSide({ title, lines }: { title: string; lines: string[] }) {
  const text = describeAnchoredFootnotes(lines.join("\n")).trim();
  return (
    <div className="min-w-0">
      <p className="text-muted">{title}</p>
      <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-panel px-2 py-1">
        {text || <span className="text-muted">(removed)</span>}
      </p>
    </div>
  );
}
