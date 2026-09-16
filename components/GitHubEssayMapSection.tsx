"use client";

import { useEffect, useState } from "react";
import { GitHubMapFields } from "@/components/GitHubMapFields";
import { GithubMark } from "@/components/icons";
import { SettingsInfo } from "@/components/SettingsInfo";
import {
  ensureMarkdownFileName,
  GITHUB_DOCUMENT_PATH_HINT,
  requireGithubDocumentPath,
} from "@/lib/github/repo";
import {
  loadGithubSettings,
  saveGithubSettings,
} from "@/lib/github/settings";
import { githubMapLooksBroken, githubStatusTitle, githubStatusToneClass } from "@/lib/github/status";
import type { GithubMapStatus, GithubRemoteSettings } from "@/lib/github/types";
import {
  SETTINGS_TOAST,
  showSettingsError,
  showSettingsSuccess,
} from "@/lib/ui/settingsToast";

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
        showSettingsError(
          error,
          "Could not load GitHub settings.",
          SETTINGS_TOAST.essayGithub
        );
      });
    return () => {
      cancelled = true;
    };
  }, [previewMode, nodeId, settingsEpoch]);

  const pathHint = GITHUB_DOCUMENT_PATH_HINT;
  const existing = settings?.maps.find((map) => map.nodeId === nodeId);
  const pathPlaceholder =
    existing?.path ||
    status?.path ||
    (documentName ? ensureMarkdownFileName(documentName) : pathHint);
  const inherited = status?.source === "inherited" && !existing;
  const broken = status && githubMapLooksBroken(status);

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
      showSettingsSuccess(okMessage, SETTINGS_TOAST.essayGithub);
      onSettingsChanged?.();
    } catch (error) {
      showSettingsError(
        error,
        "Could not save GitHub mapping.",
        SETTINGS_TOAST.essayGithub
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
        <SettingsInfo text="Map this essay to a .md file in your backup repo. First push creates that file if it is missing; later pushes overwrite it. Extra files in the repo are left alone. Pull shows a diff before replacing the editor. Token and default repo live in Settings → Integrations. Do not map to a folder name; that would replace the folder on GitHub." />
      </h3>
      {status && (
        <p
          className={githubStatusToneClass(status)}
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
            try {
              const nextPath = requireGithubDocumentPath(path);
              void persistMaps(
                [
                  ...(settings?.maps.filter((map) => map.nodeId !== nodeId) ?? []),
                  {
                    nodeId,
                    repo: repo.trim(),
                    branch: branch.trim(),
                    path: nextPath,
                  },
                ],
                "Mapping saved."
              );
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Could not save GitHub mapping."
              );
            }
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
