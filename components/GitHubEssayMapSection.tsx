"use client";

import { useEffect, useState } from "react";
import { GitHubMapFields } from "@/components/GitHubMapFields";
import { GithubMark } from "@/components/icons";
import { SettingsInfo } from "@/components/SettingsInfo";
import { ensureMarkdownFileName } from "@/lib/github/repo";
import {
  loadGithubSettings,
  saveGithubSettings,
} from "@/lib/github/settings";
import { githubStatusTitle } from "@/lib/github/status";
import type { GithubMapStatus, GithubRemoteSettings } from "@/lib/github/types";

type Props = {
  nodeId: string;
  documentName?: string | null;
  previewMode?: boolean;
  status?: GithubMapStatus;
  settingsEpoch?: number;
  onSettingsChanged?: () => void;
};

export function GitHubEssayMapSection({
  nodeId,
  documentName = null,
  previewMode = false,
  status,
  settingsEpoch = 0,
  onSettingsChanged,
}: Props) {
  const [settings, setSettings] = useState<GithubRemoteSettings | null>(null);
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    void loadGithubSettings()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        const existing = next.maps.find((map) => map.nodeId === nodeId);
        setRepo(existing?.repo ?? "");
        setBranch(existing?.branch ?? "");
        setPath(existing?.path ?? "");
        setMessage(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(
          error instanceof Error ? error.message : "Could not load GitHub settings."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [previewMode, nodeId, settingsEpoch]);

  const pathHint = "Exact file in the repo, e.g. README.md";
  const existing = settings?.maps.find((map) => map.nodeId === nodeId);
  const pathPlaceholder =
    existing?.path ||
    status?.path ||
    (documentName ? ensureMarkdownFileName(documentName) : pathHint);
  const inherited = status?.source === "inherited" && !existing;
  const broken =
    status &&
    (status.health === "missing" ||
      status.health === "error" ||
      status.stale);

  async function persistMaps(
    maps: GithubRemoteSettings["maps"],
    okMessage: string
  ) {
    if (!settings) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = { ...settings, maps };
      await saveGithubSettings(next);
      setSettings(next);
      setMessage(okMessage);
      onSettingsChanged?.();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save GitHub mapping."
      );
    } finally {
      setBusy(false);
    }
  }

  if (previewMode) {
    return (
      <p className="settings-help">
        Sign in to map this essay to a GitHub file. The personal access token
        stays on this device under Settings → Integrations.
      </p>
    );
  }

  return (
    <>
      <h3>
        Mapping
        <SettingsInfo text="Map this essay to a file in your backup repo. Push overwrites that path and leaves extra files alone. Pull shows a diff before replacing the editor. Token and default repo live in Settings → Integrations." />
      </h3>
      {status && (
        <p
          className={
            status.health === "ok"
              ? "explorer-github-ok"
              : broken
                ? "explorer-github-missing"
                : "explorer-github-unchecked"
          }
          title={githubStatusTitle(status)}
        >
          <GithubMark size={12} struck={Boolean(broken)} />{" "}
          {githubStatusTitle(status)}
        </p>
      )}
      {inherited && (
        <p className="settings-help">
          Included via a folder map
          {status?.path ? ` (${status.repo}/${status.path})` : ""}. Saving here
          adds a document-specific path that overrides the folder.
        </p>
      )}
      {!settings?.repo && (
        <p className="settings-help">
          Set a default repo in Settings → Integrations if you leave Repo blank below.
        </p>
      )}
      <GitHubMapFields
        repo={repo}
        branch={branch}
        path={path}
        defaultRepo={settings?.repo ?? ""}
        defaultBranch={settings?.branch ?? "main"}
        pathHint={pathHint}
        pathPlaceholder={pathPlaceholder}
        onRepoChange={setRepo}
        onBranchChange={setBranch}
        onPathChange={setPath}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={busy || !settings || !path.trim()}
          onClick={() => {
            void persistMaps(
              [
                ...(settings?.maps.filter((map) => map.nodeId !== nodeId) ?? []),
                {
                  nodeId,
                  repo: repo.trim(),
                  branch: branch.trim(),
                  path: path.trim().replace(/^\/+/, ""),
                },
              ],
              "Mapping saved."
            );
          }}
        >
          {existing ? "Save mapping" : "Add mapping"}
        </button>
        {existing && (
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
            disabled={busy}
            onClick={() => {
              setRepo("");
              setBranch("");
              setPath("");
              void persistMaps(
                settings?.maps.filter((map) => map.nodeId !== nodeId) ?? [],
                "Mapping removed."
              );
            }}
          >
            Remove mapping
          </button>
        )}
      </div>
      {message && <p className="mt-2 text-xs text-muted">{message}</p>}
    </>
  );
}
