"use client";

import { useEffect, useState } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import {
  EditorPrefsSection,
  MarkdownPrefsSection,
} from "@/components/EditorPrefsFields";
import { SettingsInfo } from "@/components/SettingsInfo";
import {
  loadAiKeys,
  maskKey,
  saveAiKeys,
  type AiKeys,
  type AiProvider,
} from "@/lib/ai/keys";
import {
  cleanUnusedEssayImages,
  fetchQuotaUsage,
  formatBytes,
  type QuotaUsage,
} from "@/lib/assets/quota";
import {
  openBillingPortal,
  startHostedProCheckout,
} from "@/lib/billing/client";
import {
  formatQuotaMib,
  HOSTED_PLANS,
  HOSTED_PRO_PRICE_LABEL,
} from "@/lib/billing/plans";
import { ProfilePhotoField } from "@/components/avatar/ProfilePhotoField";
import { GitHubSettingsSection } from "@/components/GitHubSettingsSection";
import { PushbulletSettingsSection } from "@/components/PushbulletSettingsSection";
import { closeBiblePin } from "@/lib/pins/pinStore";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { GithubMapStatus } from "@/lib/github/types";

type GithubSettingsProps = {
  githubMapNodes?: Array<{
    id: string;
    label: string;
    kind: "folder" | "document";
  }>;
  githubMapStatuses?: GithubMapStatus[];
  githubSettingsEpoch?: number;
  onGithubSettingsChanged?: () => void;
  onPushWorkspace?: () => void;
  onPullMapped?: () => void;
  pushbulletChannels?: Array<{ id: string; name: string }>;
};

export type SettingsTab =
  | "account"
  | "editor"
  | "markdown"
  | "storage"
  | "integrations";

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  email?: string;
  displayName?: string;
  avatarUrl?: string | null;
  previewMode?: boolean;
  onDisplayNameChange?: (name: string) => void;
  onAvatarUrlChange?: (url: string | null) => void;
} & GithubSettingsProps;

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "editor", label: "Editor" },
  { id: "markdown", label: "Markdown" },
  { id: "storage", label: "Storage" },
  { id: "integrations", label: "Integrations" },
];

export function SettingsPanel({
  open,
  onClose,
  initialTab = "account",
  email = "",
  displayName = "",
  avatarUrl = null,
  previewMode = false,
  onDisplayNameChange,
  onAvatarUrlChange,
  githubMapNodes,
  githubMapStatuses,
  githubSettingsEpoch,
  onGithubSettingsChanged,
  onPushWorkspace,
  onPullMapped,
  pushbulletChannels,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Remount so drafts reset from localStorage without syncing in an effect.
  return (
    <SettingsDialog
      key={`${String(open)}:${initialTab}`}
      onClose={onClose}
      initialTab={initialTab}
      email={email}
      displayName={displayName}
      avatarUrl={avatarUrl}
      previewMode={previewMode}
      onDisplayNameChange={onDisplayNameChange}
      onAvatarUrlChange={onAvatarUrlChange}
      githubMapNodes={githubMapNodes}
      githubMapStatuses={githubMapStatuses}
      githubSettingsEpoch={githubSettingsEpoch}
      onGithubSettingsChanged={onGithubSettingsChanged}
      onPushWorkspace={onPushWorkspace}
      onPullMapped={onPullMapped}
      pushbulletChannels={pushbulletChannels}
    />
  );
}

function SettingsDialog({
  onClose,
  initialTab,
  email,
  displayName,
  avatarUrl,
  previewMode,
  onDisplayNameChange,
  onAvatarUrlChange,
  githubMapNodes,
  githubMapStatuses,
  githubSettingsEpoch,
  onGithubSettingsChanged,
  onPushWorkspace,
  onPullMapped,
  pushbulletChannels,
}: {
  onClose: () => void;
  initialTab: SettingsTab;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  previewMode: boolean;
  onDisplayNameChange?: (name: string) => void;
  onAvatarUrlChange?: (url: string | null) => void;
} & GithubSettingsProps) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [aiKeys, setAiKeys] = useState<AiKeys>(() => loadAiKeys());
  const [keyDraft, setKeyDraft] = useState("");
  const [keysSaved, setKeysSaved] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<string | null>(null);
  const [quotaBusy, setQuotaBusy] = useState(false);
  /** From /api/billing/status — deployment mode, not inferred from quota size. */
  const [selfHost, setSelfHost] = useState(false);
  const [billingAvailable, setBillingAvailable] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [subscriptionLabel, setSubscriptionLabel] = useState<string | null>(
    null
  );
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (previewMode || !isSupabaseConfigured()) return;
    void fetchQuotaUsage()
      .then((usage) => setQuota(usage))
      .catch(() => setQuota(null));
    void fetch("/api/billing/status")
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json()) as {
          billingAvailable?: boolean;
          plan?: string;
          usedBytes?: number;
          quotaBytes?: number;
          subscriptionLabel?: string | null;
          selfHost?: boolean;
        };
        setBillingAvailable(Boolean(body.billingAvailable));
        setSelfHost(Boolean(body.selfHost));
        setPlan(body.plan === "pro" ? "pro" : "free");
        setSubscriptionLabel(body.subscriptionLabel ?? null);
        if (
          typeof body.usedBytes === "number" &&
          typeof body.quotaBytes === "number"
        ) {
          setQuota({
            usedBytes: body.usedBytes,
            quotaBytes: body.quotaBytes,
          });
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, [previewMode]);

  const provider: AiProvider = aiKeys.preferred ?? "anthropic";
  const providerLabel = provider === "anthropic" ? "Anthropic" : "OpenAI";
  const savedKey = provider === "anthropic" ? aiKeys.anthropic : aiKeys.openai;
  const signedIn = !previewMode && isSupabaseConfigured();

  function saveKeys() {
    if (!keyDraft.trim()) return;
    const next = saveAiKeys({ ...aiKeys, [provider]: keyDraft.trim() });
    setAiKeys(next);
    setKeyDraft("");
    setKeysSaved(true);
  }

  function clearProviderKey() {
    const next = saveAiKeys({ ...aiKeys, [provider]: "" });
    setAiKeys(next);
    setKeyDraft("");
  }

  const storageInfo = selfHost
    ? "Combined usage for essay markdown and Storage (images + Library PDFs). The assets bucket is public-by-URL so published embeds work. Self-host: BlogIDE does not apply a small SaaS cap; your Supabase project is the real limit."
    : `Combined usage for essay markdown and Storage (images + Library PDFs). The assets bucket is public-by-URL so published embeds work. Plan: ${HOSTED_PLANS[plan].label}${
        plan === "pro"
          ? ` (${formatQuotaMib(HOSTED_PLANS.pro.quotaBytes)})`
          : ` (${formatQuotaMib(HOSTED_PLANS.free.quotaBytes)})`
      }.`;

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-panel is-anchored"
      >
        <div className="settings-panel-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings">
            Close
          </button>
        </div>

        <div className="settings-panel-tabs" role="tablist" aria-label="Settings">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={
                tab === item.id
                  ? "settings-panel-tab is-active"
                  : "settings-panel-tab"
              }
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="settings-panel-body" role="tabpanel">
          {tab === "account" && (
            <>
              <section className="settings-section">
                {!signedIn ? (
                  <p className="settings-help">
                    Sign in with Supabase to edit your profile photo, display
                    name, and password.
                  </p>
                ) : (
                  <>
                    <ProfilePhotoField
                      initialUrl={avatarUrl}
                      displayName={nameDraft || displayName}
                      onUrlChange={onAvatarUrlChange}
                    />
                    <label className="settings-row settings-row-stack">
                      <span>Email</span>
                      <input
                        type="email"
                        value={email}
                        readOnly
                        className="settings-text-input opacity-80"
                      />
                    </label>
                    <label className="settings-row settings-row-stack">
                      <span>Display name</span>
                      <input
                        type="text"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="settings-text-input"
                        placeholder="Your name"
                        autoComplete="name"
                      />
                    </label>
                    <button
                      type="button"
                      className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                      disabled={nameBusy || !nameDraft.trim()}
                      onClick={() => {
                        void (async () => {
                          setNameBusy(true);
                          setNameStatus(null);
                          try {
                            const supabase = createClient();
                            const trimmed = nameDraft.trim();
                            const { error } = await supabase.auth.updateUser({
                              data: {
                                full_name: trimmed,
                                name: trimmed,
                                display_name: trimmed,
                              },
                            });
                            if (error) throw error;
                            onDisplayNameChange?.(trimmed);
                            setNameStatus("Name saved.");
                          } catch (err) {
                            setNameStatus(
                              err instanceof Error
                                ? err.message
                                : "Could not update name."
                            );
                          } finally {
                            setNameBusy(false);
                          }
                        })();
                      }}
                    >
                      Save name
                    </button>
                    {nameStatus && (
                      <p className="mt-2 text-xs text-muted">{nameStatus}</p>
                    )}
                  </>
                )}
              </section>

              {signedIn && (
                <section className="settings-section">
                  <h3>Password</h3>
                  <label className="settings-row settings-row-stack">
                    <span>New password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="settings-text-input"
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                    />
                  </label>
                  <label className="settings-row settings-row-stack">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="settings-text-input"
                      autoComplete="new-password"
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                    disabled={passwordBusy || !password}
                    onClick={() => {
                      void (async () => {
                        setPasswordBusy(true);
                        setPasswordStatus(null);
                        try {
                          if (password.length < 8) {
                            throw new Error(
                              "Password must be at least 8 characters."
                            );
                          }
                          if (password !== passwordConfirm) {
                            throw new Error("Passwords do not match.");
                          }
                          const supabase = createClient();
                          const { error } = await supabase.auth.updateUser({
                            password,
                          });
                          if (error) throw error;
                          setPassword("");
                          setPasswordConfirm("");
                          setPasswordStatus("Password updated.");
                        } catch (err) {
                          setPasswordStatus(
                            err instanceof Error
                              ? err.message
                              : "Could not update password."
                          );
                        } finally {
                          setPasswordBusy(false);
                        }
                      })();
                    }}
                  >
                    Update password
                  </button>
                  {passwordStatus && (
                    <p className="mt-2 text-xs text-muted">{passwordStatus}</p>
                  )}
                </section>
              )}
            </>
          )}

          {tab === "editor" && <EditorPrefsSection />}

          {tab === "markdown" && <MarkdownPrefsSection />}

          {tab === "storage" && (
            <section className="settings-section">
              <h3>
                Usage
                <SettingsInfo text={storageInfo} />
              </h3>
              {!signedIn ? (
                <p className="settings-help">
                  Sign in with Supabase to see storage usage and free space.
                </p>
              ) : (
                <>
                  {quota ? (
                    <p className="mb-2 text-sm">
                      {selfHost ? (
                        <>{formatBytes(quota.usedBytes)} used</>
                      ) : (
                        <>
                          {formatBytes(quota.usedBytes)} /{" "}
                          {formatBytes(quota.quotaBytes)} used
                          <span className="text-muted">
                            {" "}
                            (
                            {quota.quotaBytes > 0
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (100 * quota.usedBytes) / quota.quotaBytes
                                  )
                                )
                              : 0}
                            %)
                          </span>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="mb-2 text-xs text-muted">Loading usage…</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                      disabled={quotaBusy}
                      onClick={() => {
                        void (async () => {
                          setQuotaBusy(true);
                          setQuotaStatus(null);
                          try {
                            const result = await cleanUnusedEssayImages();
                            const usage = await fetchQuotaUsage();
                            setQuota(usage);
                            setQuotaStatus(
                              result.removed === 0
                                ? "No unused images found."
                                : `Removed ${result.removed} unused image${
                                    result.removed === 1 ? "" : "s"
                                  } (${formatBytes(result.freedBytes)} freed).`
                            );
                          } catch (err) {
                            setQuotaStatus(
                              err instanceof Error
                                ? err.message
                                : "Could not clean unused images."
                            );
                          } finally {
                            setQuotaBusy(false);
                          }
                        })();
                      }}
                    >
                      {quotaBusy ? "Cleaning…" : "Clean unused images"}
                    </button>
                    {billingAvailable && plan === "free" ? (
                      <button
                        type="button"
                        className="rounded border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-40"
                        disabled={billingBusy}
                        onClick={() => {
                          void (async () => {
                            setBillingBusy(true);
                            setBillingStatus(null);
                            try {
                              await startHostedProCheckout();
                            } catch (err) {
                              setBillingStatus(
                                err instanceof Error
                                  ? err.message
                                  : "Could not start checkout."
                              );
                              setBillingBusy(false);
                            }
                          })();
                        }}
                      >
                        {billingBusy
                          ? "Redirecting…"
                          : `Upgrade to Pro (${HOSTED_PRO_PRICE_LABEL})`}
                      </button>
                    ) : null}
                    {billingAvailable && plan === "pro" ? (
                      <button
                        type="button"
                        className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                        disabled={billingBusy}
                        onClick={() => {
                          void (async () => {
                            setBillingBusy(true);
                            setBillingStatus(null);
                            try {
                              await openBillingPortal();
                            } catch (err) {
                              setBillingStatus(
                                err instanceof Error
                                  ? err.message
                                  : "Could not open billing portal."
                              );
                              setBillingBusy(false);
                            }
                          })();
                        }}
                      >
                        {billingBusy ? "Opening…" : "Manage billing"}
                      </button>
                    ) : null}
                  </div>
                  {subscriptionLabel ? (
                    <p className="mt-2 text-xs text-muted">
                      {subscriptionLabel}
                    </p>
                  ) : null}
                  {quotaStatus && (
                    <p className="mt-2 text-xs text-muted">{quotaStatus}</p>
                  )}
                  {billingStatus && (
                    <p className="mt-2 text-xs text-muted">{billingStatus}</p>
                  )}
                </>
              )}
            </section>
          )}

          {tab === "integrations" && (
            <>
              <section className="settings-section">
                <h3>
                  AI API keys
                  <SettingsInfo text="Bring your own Anthropic and/or OpenAI key. Keys are stored only in this browser and sent to the provider when you use the assistant, never saved to BlogIDE's database. Hosted BlogIDE keeps BYOK as the default so model usage stays on your API bill. With a key saved, Cleanup → Import offers Clean with AI for messy Substack or Docs paste." />
                </h3>
                <label className="settings-row">
                  <span>Provider</span>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const preferred = e.target.value as AiProvider;
                      const next = saveAiKeys({ ...aiKeys, preferred });
                      setAiKeys(next);
                      setKeyDraft("");
                    }}
                  >
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </label>
                <label className="settings-row settings-row-stack">
                  <span>{providerLabel} API key</span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      savedKey
                        ? `Saved · ${maskKey(savedKey)}`
                        : provider === "anthropic"
                          ? "sk-ant-…"
                          : "sk-…"
                    }
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveKeys();
                      }
                    }}
                    className="settings-text-input"
                  />
                  {savedKey && (
                    <button
                      type="button"
                      className="settings-link-btn"
                      onClick={clearProviderKey}
                    >
                      Remove {providerLabel} key
                    </button>
                  )}
                </label>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
                  onClick={saveKeys}
                >
                  Save API keys
                </button>
                {keysSaved && (
                  <p className="mt-2 text-xs text-muted">
                    Keys saved on this device.
                  </p>
                )}
              </section>

              <GitHubSettingsSection
                previewMode={previewMode}
                mapNodes={githubMapNodes}
                mapStatuses={githubMapStatuses}
                settingsEpoch={githubSettingsEpoch}
                onSettingsChanged={onGithubSettingsChanged}
                onPushWorkspace={onPushWorkspace}
                onPullMapped={onPullMapped}
              />

              <PushbulletSettingsSection
                previewMode={previewMode}
                channels={pushbulletChannels}
              />

              <section className="settings-section">
                <h3>
                  fetch(bible)
                  <SettingsInfo text="Optional scripture tools from fetch.bible. Off by default. When on, English Bible references in the essay are highlighted and stay as plain text in markdown. Hover a highlight to preview the Berean Standard Bible; click it (or use the essay menu → Open Bible) for the chapter and verse reader. Publication preview also turns references into links." />
                </h3>
                <label className="settings-row">
                  <span>Enable fetch(bible)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs.fetchBibleEnabled)}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      updatePrefs({ fetchBibleEnabled: enabled });
                      if (!enabled) closeBiblePin();
                    }}
                  />
                </label>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
