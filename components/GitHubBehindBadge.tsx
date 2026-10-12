"use client";

import { useEffect, useState } from "react";
import { GithubMark } from "@/components/icons";
import { githubRemoteAhead } from "@/lib/github/remoteAhead";
import type { GithubMapStatus } from "@/lib/github/types";

/**
 * Toolbar badge when GitHub has a version of this essay BlogIDE never had
 * (a commit from another tool). Shown so the writer pulls before editing
 * further or pushing over it. Checked when the essay opens, after a push or
 * pull, and when the tab regains focus (AppShell re-reads GitHub then).
 */
export function GitHubBehindBadge({
  nodeId,
  status,
  epoch,
  getMarkdown,
  onPull,
}: {
  nodeId: string | null;
  status: GithubMapStatus | undefined;
  epoch: number;
  getMarkdown: () => string | null;
  onPull?: () => void;
}) {
  const [aheadKey, setAheadKey] = useState<string | null>(null);
  const remoteSha = status?.health === "ok" ? status.remoteSha : undefined;
  const key = nodeId && remoteSha ? `${nodeId}:${remoteSha}:${epoch}` : null;

  useEffect(() => {
    if (!key || !nodeId || !status || !remoteSha) return;
    let cancelled = false;
    void githubRemoteAhead({
      nodeId,
      repo: status.repo,
      branch: status.branch,
      path: status.path,
      remoteSha,
      localMarkdown: getMarkdown() ?? "",
    })
      .then((ahead) => {
        if (!cancelled) setAheadKey(ahead ? key : null);
      })
      .catch(() => {
        if (!cancelled) setAheadKey(null);
      });
    return () => {
      cancelled = true;
    };
    // getMarkdown is read once per check, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key || aheadKey !== key || !onPull) return null;

  return (
    <button
      type="button"
      onClick={onPull}
      className="blogide-chrome-btn relative inline-flex items-center gap-1 border-amber-500/50 text-amber-700 dark:text-amber-300"
      title="This essay changed on GitHub since BlogIDE last synced. Pull to merge it before you edit much more or push (pushing would overwrite it)."
      aria-label="New changes on GitHub: pull to merge them"
    >
      <GithubMark size={13} />
      <span className="hidden sm:inline">Pull</span>
      <span
        aria-hidden
        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500"
      />
    </button>
  );
}
