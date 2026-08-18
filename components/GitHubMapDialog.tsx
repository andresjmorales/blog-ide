"use client";

import { useEffect, useId, useState } from "react";
import type { GithubSyncMap } from "@/lib/github/types";

type FolderOption = {
  id: string;
  label: string;
  kind: "folder" | "document";
};

type Props = {
  open: boolean;
  onClose: () => void;
  nodes: FolderOption[];
  initialNodeId?: string;
  defaultRepo: string;
  defaultBranch: string;
  existing?: GithubSyncMap | null;
  onSave: (map: GithubSyncMap) => void;
};

export function GitHubMapDialog({
  open,
  onClose,
  nodes,
  initialNodeId,
  defaultRepo,
  defaultBranch,
  existing,
  onSave,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <GitHubMapForm
      key={`${initialNodeId ?? ""}:${existing?.nodeId ?? ""}:${existing?.path ?? ""}`}
      onClose={onClose}
      nodes={nodes}
      initialNodeId={initialNodeId}
      defaultRepo={defaultRepo}
      defaultBranch={defaultBranch}
      existing={existing}
      onSave={onSave}
    />
  );
}

function GitHubMapForm({
  onClose,
  nodes,
  initialNodeId,
  defaultRepo,
  defaultBranch,
  existing,
  onSave,
}: Omit<Props, "open">) {
  const titleId = useId();
  const [nodeId, setNodeId] = useState(initialNodeId ?? existing?.nodeId ?? "");
  const [repo, setRepo] = useState(existing?.repo ?? "");
  const [branch, setBranch] = useState(existing?.branch ?? "");
  const [path, setPath] = useState(existing?.path ?? "");

  const selected = nodes.find((n) => n.id === nodeId);
  const pathHint =
    selected?.kind === "document"
      ? "Exact file in the repo, e.g. README.md"
      : "Directory prefix, e.g. content/essays";

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close GitHub mapping"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id={titleId}>Map to GitHub</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        <section className="settings-section">
          <p className="settings-help">
            One-way by default: BlogIDE overwrites matching files in the repo.
            Extra files are left alone. If you moved a mapped file in git, pull
            or remap before pushing — otherwise the old path is recreated.
            The token stays on this device.
          </p>
          <label className="settings-row settings-row-stack">
            <span>Folder or document</span>
            <select
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              className="settings-text-input"
            >
              <option value="">Select…</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                  {n.kind === "document" ? " (file)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-row settings-row-stack">
            <span>Repo (optional override)</span>
            <input
              className="settings-text-input"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder={defaultRepo || "owner/repo"}
            />
          </label>
          <label className="settings-row settings-row-stack">
            <span>Branch (optional)</span>
            <input
              className="settings-text-input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder={defaultBranch || "main"}
            />
          </label>
          <label className="settings-row settings-row-stack">
            <span>Path</span>
            <input
              className="settings-text-input"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder={pathHint}
            />
          </label>
          <p className="settings-help">{pathHint}</p>
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
            disabled={!nodeId || !path.trim()}
            onClick={() => {
              onSave({
                nodeId,
                repo: repo.trim(),
                branch: branch.trim(),
                path: path.trim().replace(/^\/+/, ""),
              });
              onClose();
            }}
          >
            Save mapping
          </button>
        </section>
      </div>
    </div>
  );
}
