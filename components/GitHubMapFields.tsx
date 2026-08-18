"use client";

type Props = {
  repo: string;
  branch: string;
  path: string;
  defaultRepo: string;
  defaultBranch: string;
  pathHint: string;
  pathPlaceholder?: string;
  onRepoChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onPathChange: (value: string) => void;
};

export function GitHubMapFields({
  repo,
  branch,
  path,
  defaultRepo,
  defaultBranch,
  pathHint,
  pathPlaceholder,
  onRepoChange,
  onBranchChange,
  onPathChange,
}: Props) {
  return (
    <>
      <label className="settings-row settings-row-stack">
        <span>Repo (optional override)</span>
        <input
          className="settings-text-input"
          value={repo}
          onChange={(e) => onRepoChange(e.target.value)}
          placeholder={defaultRepo || "owner/repo"}
        />
      </label>
      <label className="settings-row settings-row-stack">
        <span>Branch (optional)</span>
        <input
          className="settings-text-input"
          value={branch}
          onChange={(e) => onBranchChange(e.target.value)}
          placeholder={defaultBranch || "main"}
        />
      </label>
      <label className="settings-row settings-row-stack">
        <span>Path</span>
        <input
          className="settings-text-input"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          placeholder={pathPlaceholder || pathHint}
        />
      </label>
      <p className="settings-help">{pathHint}</p>
    </>
  );
}
