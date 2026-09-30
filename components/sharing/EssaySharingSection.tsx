"use client";

import { useEffect, useState } from "react";
import { SettingsInfo } from "@/components/SettingsInfo";
import { copyPlainText } from "@/lib/citations/clipboard";
import {
  fetchInviteEmailEnabled,
  listDocumentShares,
  resetDocumentShareLink,
  revokeDocumentShare,
  sendShareInvite,
  shareDocument,
  updateDocumentShare,
} from "@/lib/sharing/api";
import {
  normalizeShareEmail,
  SHARE_ROLE_LABELS,
  SHARE_ROLES,
  shareFailureMessage,
  shareInviteMailto,
  shareLink,
  type DocumentShare,
  type ShareRole,
} from "@/lib/sharing/types";
import { showCopiedToast } from "@/lib/ui/toast";
import {
  SETTINGS_TOAST,
  showSettingsError,
  showSettingsSuccess,
} from "@/lib/ui/settingsToast";

type Props = {
  nodeId: string;
  title: string;
  previewMode?: boolean;
  inVault?: boolean;
  senderName?: string | null;
};

const BUTTON =
  "rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40";
const SMALL_BUTTON =
  "rounded px-1.5 py-0.5 text-xs text-muted hover:text-accent disabled:opacity-40";

function openedLabel(share: DocumentShare): string {
  if (!share.grantee_id) return "Not opened yet";
  if (!share.last_opened_at) return "Joined";
  const date = new Date(share.last_opened_at);
  return `Opened ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function EssaySharingSection({
  nodeId,
  title,
  previewMode = false,
  inVault = false,
  senderName = null,
}: Props) {
  const [shares, setShares] = useState<DocumentShare[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("commenter");
  const [inputError, setInputError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** null while checking; true when the server sends invites via Resend. */
  const [canSendEmail, setCanSendEmail] = useState<boolean | null>(null);
  const [sendOnShare, setSendOnShare] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const disabled = previewMode || inVault;

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    void fetchInviteEmailEnabled().then((enabled) => {
      if (!cancelled) setCanSendEmail(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [disabled]);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    listDocumentShares(nodeId)
      .then((rows) => {
        if (!cancelled) setShares(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            "Could not load sharing. If this is a new install, run the latest Supabase migration."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, disabled]);

  async function refresh() {
    setShares(await listDocumentShares(nodeId));
  }

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeShareEmail(email);
    if (!normalized) {
      setInputError("Enter a full email address.");
      return;
    }
    setInputError(null);
    setBusy(true);
    try {
      const result = await shareDocument(nodeId, normalized, role);
      if (!result.ok) {
        setInputError(shareFailureMessage(result.reason));
        return;
      }
      setEmail("");
      await refresh();
      if (canSendEmail && sendOnShare && typeof result.id === "string") {
        try {
          await sendShareInvite(result.id);
          showSettingsSuccess(
            `Shared with ${normalized}. Invite emailed.`,
            SETTINGS_TOAST.essaySharing
          );
        } catch (error) {
          showSettingsError(
            error,
            `Shared with ${normalized}, but the invite email failed. Use Copy link instead.`,
            SETTINGS_TOAST.essaySharing
          );
        }
      } else if (typeof result.token === "string") {
        const link = shareLink(result.token);
        const copied = await copyPlainText(link);
        showSettingsSuccess(
          copied
            ? `Shared with ${normalized}. Link copied.`
            : `Shared with ${normalized}.`,
          SETTINGS_TOAST.essaySharing
        );
      }
    } catch (error) {
      showSettingsError(error, "Could not share this essay.", SETTINGS_TOAST.essaySharing);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(share: DocumentShare, next: ShareRole) {
    setShares((rows) =>
      rows?.map((row) => (row.id === share.id ? { ...row, role: next } : row)) ??
      rows
    );
    try {
      const result = await updateDocumentShare(share.id, next);
      if (!result.ok) throw new Error(shareFailureMessage(result.reason));
    } catch (error) {
      showSettingsError(error, "Could not change access.", SETTINGS_TOAST.essaySharing);
      await refresh().catch(() => undefined);
    }
  }

  async function remove(share: DocumentShare) {
    setBusy(true);
    try {
      const result = await revokeDocumentShare(share.id);
      if (!result.ok) throw new Error(shareFailureMessage(result.reason));
      await refresh();
      showSettingsSuccess(
        `Removed ${share.grantee_email}. Their link no longer works.`,
        SETTINGS_TOAST.essaySharing
      );
    } catch (error) {
      showSettingsError(error, "Could not remove access.", SETTINGS_TOAST.essaySharing);
    } finally {
      setBusy(false);
    }
  }

  async function resetLink(share: DocumentShare) {
    setBusy(true);
    try {
      const result = await resetDocumentShareLink(share.id);
      if (!result.ok || typeof result.token !== "string") {
        throw new Error(shareFailureMessage(result.reason));
      }
      await refresh();
      await copyPlainText(shareLink(result.token));
      showSettingsSuccess(
        "New link copied. The old link stops working.",
        SETTINGS_TOAST.essaySharing
      );
    } catch (error) {
      showSettingsError(error, "Could not reset the link.", SETTINGS_TOAST.essaySharing);
    } finally {
      setBusy(false);
    }
  }

  async function emailInvite(share: DocumentShare) {
    setSendingId(share.id);
    try {
      await sendShareInvite(share.id);
      showSettingsSuccess(
        `Invite emailed to ${share.grantee_email}.`,
        SETTINGS_TOAST.essaySharing
      );
    } catch (error) {
      showSettingsError(error, "Could not send the invite.", SETTINGS_TOAST.essaySharing);
    } finally {
      setSendingId(null);
    }
  }

  async function copyLink(share: DocumentShare) {
    if (await copyPlainText(shareLink(share.token))) {
      showCopiedToast(`Copied ${share.grantee_email}'s link.`);
    }
  }

  if (inVault) {
    return (
      <p className="settings-help">
        Vault essays are end-to-end encrypted, so they can&apos;t be shared.
        Move the essay out of the vault to share it.
      </p>
    );
  }

  if (previewMode) {
    return (
      <p className="settings-help">Sign in to share this essay.</p>
    );
  }

  return (
    <>
      <p className="settings-help">
        Each person gets their own link. They sign in with the email you
        enter here; the first account to open the link keeps it.
      </p>

      <form className="flex flex-wrap items-center gap-2" onSubmit={addPerson}>
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setInputError(null);
          }}
          placeholder="name@example.com"
          aria-label="Email to share with"
          className="settings-text-input min-w-0 flex-1"
          disabled={busy}
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as ShareRole)}
          aria-label="Access level"
          className="rounded border border-border bg-panel px-1.5 py-1.5 text-xs"
          disabled={busy}
        >
          {SHARE_ROLES.map((item) => (
            <option key={item} value={item}>
              {SHARE_ROLE_LABELS[item]}
            </option>
          ))}
        </select>
        <button type="submit" className={BUTTON} disabled={busy || !email.trim()}>
          Share
        </button>
      </form>
      {canSendEmail && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={sendOnShare}
            onChange={(event) => setSendOnShare(event.target.checked)}
          />
          Email them an invite
        </label>
      )}
      {inputError && (
        <p className="settings-help text-red-600 dark:text-red-400" role="alert">
          {inputError}
        </p>
      )}

      <h3>
        People with access
        <SettingsInfo text="Can view: read only. Can comment: highlight text and leave threads. Can suggest: also propose edits you accept or reject." />
      </h3>

      {loadError ? (
        <p className="settings-help">{loadError}</p>
      ) : shares === null ? (
        <p className="settings-help">Loading…</p>
      ) : shares.length === 0 ? (
        <p className="settings-help">Only you can open this essay.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="People with access">
          {shares.map((share) => (
            <li
              key={share.id}
              className="flex flex-col gap-1 rounded border border-border px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">
                  {share.grantee_email}
                </span>
                <select
                  value={share.role}
                  onChange={(event) =>
                    void changeRole(share, event.target.value as ShareRole)
                  }
                  aria-label={`Access for ${share.grantee_email}`}
                  className="rounded border border-border bg-panel px-1 py-0.5 text-xs"
                  disabled={busy}
                >
                  {SHARE_ROLES.map((item) => (
                    <option key={item} value={item}>
                      {SHARE_ROLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
                <span className="mr-auto">{openedLabel(share)}</span>
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => void copyLink(share)}
                >
                  Copy link
                </button>
                {canSendEmail ? (
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    disabled={busy || sendingId === share.id}
                    onClick={() => void emailInvite(share)}
                  >
                    {sendingId === share.id ? "Sending…" : "Email invite"}
                  </button>
                ) : (
                  <a
                    className={SMALL_BUTTON}
                    href={shareInviteMailto({
                      email: share.grantee_email,
                      title,
                      link: shareLink(share.token),
                      role: share.role,
                      senderName,
                    })}
                  >
                    Email invite
                  </a>
                )}
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  disabled={busy}
                  onClick={() => void resetLink(share)}
                  title="Issue a new link; the old one stops working"
                >
                  Reset link
                </button>
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  disabled={busy}
                  onClick={() => void remove(share)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
