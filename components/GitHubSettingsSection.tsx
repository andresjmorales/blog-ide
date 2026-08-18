"use client";

import { useEffect, useState } from "react";
import { githubWhoAmI } from "@/lib/github/client";
import { pushWorkspaceToGithubWithStatus } from "@/lib/github/push";
import {
  loadGithubSettings,
  saveGithubSettings,
} from "@/lib/github/settings";
import {
  clearGithubToken,
  loadGithubToken,
  maskGithubToken,
  saveGithubToken,
} from "@/lib/github/token";
import type { GithubMapStatus, GithubRemoteSettings, GithubSyncMap } from "@/lib/github/types";
import { GitHubMapDialog } from "@/components/GitHubMapDialog";
import { GithubMark } from "@/components/icons";
import { githubStatusTitle } from "@/lib/github/status";

export type GithubMapNode = {
  id: string;
  label: string;
  kind: "folder" | "document";
};

type Props = {
  previewMode?: boolean;
  mapNodes?: GithubMapNode[];
  mapStatuses?: GithubMapStatus[];
  settingsEpoch?: number;
  onSettingsChanged?: () => void;
  onPushWorkspace?: () => void;
  onPullMapped?: () => void;
};

export function GitHubSettingsSection({
  previewMode = false,
  mapNodes = [],
  mapStatuses = [],
  settingsEpoch = 0,
  onSettingsChanged,
  onPushWorkspace,
  onPullMapped,
}: Props) {
  const [tokenDraft, setTokenDraft] = useState("");
  const [savedToken, setSavedToken] = useState(() => loadGithubToken());
  const [settings, setSettings] = useState<GithubRemoteSettings>({
    repo: "",
    branch: "main",
    path: "",
    maps: [],
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [editingMap, setEditingMap] = useState<GithubSyncMap | null>(null);

  useEffect(() => {
    if (previewMode) return;
    const timer = window.setTimeout(() => {
      void loadGithubSettings()
        .then(setSettings)
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [previewMode, settingsEpoch]);

  async function persistSettings(next: GithubRemoteSettings) {
    setSettings(next);
    if (previewMode) return;
    await saveGithubSettings(next);
    onSettingsChanged?.();
  }

  return (
    <section className="settings-section">
      <h3>GitHub backup</h3>
      <p className="settings-help">
        One-way by default: BlogIDE overwrites matching files and leaves extras
        in the repo. Pull is explicit — you will see a diff and confirm before
        anything in the editor is replaced. If you move a mapped file in git,
        BlogIDE will not follow it automatically; the mapping badge turns orange
        so you can remap or pull from the new path. The personal access token
        is stored only in this browser (Contents: Read and write).
      </p>
      {previewMode ? (
        <p className="settings-help">Sign in to configure GitHub backup.</p>
      ) : (
        <>
          <label className="settings-row settings-row-stack">
            <span>Personal access token</span>
            <input
              type="password"
              autoComplete="off"
              className="settings-text-input"
              placeholder={
                savedToken
                  ? `Saved · ${maskGithubToken(savedToken)}`
                  : "github_pat_… or ghp_…"
              }
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
              onClick={() => {
                if (!tokenDraft.trim()) return;
                saveGithubToken(tokenDraft.trim());
                setSavedToken(tokenDraft.trim());
                setTokenDraft("");
                setStatus("Token saved on this device.");
              }}
            >
              Save token
            </button>
            {savedToken && (
              <button
                type="button"
                className="settings-link-btn"
                onClick={() => {
                  clearGithubToken();
                  setSavedToken("");
                  setTokenDraft("");
                  setStatus("Token removed from this device.");
                }}
              >
                Remove token
              </button>
            )}
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
              disabled={busy || !loadGithubToken()}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setStatus(null);
                  try {
                    const me = await githubWhoAmI(loadGithubToken());
                    setStatus(`Token works as @${me.login}.`);
                  } catch (err) {
                    setStatus(
                      err instanceof Error
                        ? err.message
                        : "Could not verify token."
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Test token
            </button>
          </div>

          <label className="settings-row settings-row-stack mt-3">
            <span>Default repo</span>
            <input
              className="settings-text-input"
              value={settings.repo}
              onChange={(e) =>
                setSettings((s) => ({ ...s, repo: e.target.value }))
              }
              placeholder="owner/personal-site"
            />
          </label>
          <label className="settings-row settings-row-stack">
            <span>Default branch</span>
            <input
              className="settings-text-input"
              value={settings.branch}
              onChange={(e) =>
                setSettings((s) => ({ ...s, branch: e.target.value }))
              }
              placeholder="main"
            />
          </label>
          <label className="settings-row settings-row-stack">
            <span>Default path prefix</span>
            <input
              className="settings-text-input"
              value={settings.path}
              onChange={(e) =>
                setSettings((s) => ({ ...s, path: e.target.value }))
              }
              placeholder="content/essays (optional)"
            />
          </label>
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
            onClick={() => {
              void persistSettings(settings)
                .then(() => setStatus("GitHub settings saved."))
                .catch((err) =>
                  setStatus(
                    err instanceof Error
                      ? err.message
                      : "Could not save GitHub settings."
                  )
                );
            }}
          >
            Save repo settings
          </button>

          <h4 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Folder maps
          </h4>
          <p className="settings-help mb-2">
            Map a folder to a path in a site repo, or a document to a file such
            as README.md. Right-click in Files also works.
          </p>
          {settings.maps.length === 0 ? (
            <p className="settings-help">No folder maps yet.</p>
          ) : (
            <ul className="mb-2 list-none space-y-1 p-0 text-xs">
              {settings.maps.map((map) => {
                const label =
                  mapNodes.find((n) => n.id === map.nodeId)?.label ??
                  map.nodeId.slice(0, 8);
                const status = mapStatuses.find((s) => s.nodeId === map.nodeId);
                const broken =
                  status &&
                  (status.health === "missing" ||
                    status.health === "error" ||
                    status.stale);
                return (
                  <li
                    key={map.nodeId}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {status && (
                      <span
                        className={
                          status.health === "ok"
                            ? "explorer-github-ok"
                            : broken
                              ? "explorer-github-missing"
                              : "explorer-github-unchecked"
                        }
                        title={githubStatusTitle(status)}
                      >
                        <GithubMark size={12} struck={Boolean(broken)} />
                      </span>
                    )}
                    <span className="font-medium">{label}</span>
                    <span className="text-muted">
                      → {map.repo || settings.repo || "default repo"} /{" "}
                      {map.path}
                    </span>
                    <button
                      type="button"
                      className="settings-link-btn"
                      onClick={() => {
                        setEditingMap(map);
                        setMapOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="settings-link-btn"
                      onClick={() => {
                        void persistSettings({
                          ...settings,
                          maps: settings.maps.filter(
                            (m) => m.nodeId !== map.nodeId
                          ),
                        });
                      }}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
              onClick={() => {
                setEditingMap(null);
                setMapOpen(true);
              }}
            >
              Add mapping…
            </button>
            <button
              type="button"
              className="rounded border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                void persistSettings(settings).then(() => {
                  if (onPushWorkspace) {
                    onPushWorkspace();
                    return;
                  }
                  void (async () => {
                    setBusy(true);
                    setStatus(null);
                    try {
                      const results = await pushWorkspaceToGithubWithStatus({
                        scope: "workspace",
                      });
                      const files = results.reduce((n, r) => n + r.fileCount, 0);
                      setStatus(
                        `Pushed ${files} file${files === 1 ? "" : "s"} to GitHub.`
                      );
                    } catch (err) {
                      setStatus(
                        err instanceof Error ? err.message : "Push failed."
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                });
              }}
            >
              {busy ? "Pushing…" : "Push workspace"}
            </button>
            {onPullMapped && (
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                disabled={busy || settings.maps.length === 0}
                onClick={() => {
                  void persistSettings(settings).then(() => onPullMapped());
                }}
              >
                Pull mapped files…
              </button>
            )}
          </div>
          {status && <p className="mt-2 text-xs text-muted">{status}</p>}
        </>
      )}
      <GitHubMapDialog
        open={mapOpen}
        onClose={() => {
          setMapOpen(false);
          setEditingMap(null);
        }}
        nodes={mapNodes}
        existing={editingMap}
        defaultRepo={settings.repo}
        defaultBranch={settings.branch}
        onSave={(map) => {
          const maps = [
            ...settings.maps.filter((m) => m.nodeId !== map.nodeId),
            map,
          ];
          void persistSettings({ ...settings, maps });
        }}
      />
    </section>
  );
}
