"use client";

import { useEffect, useState } from "react";
import { SettingsInfo } from "@/components/SettingsInfo";
import { fetchUserVault } from "@/lib/vault/api";
import { VAULT_WHAT_WE_SAY } from "@/lib/vault/copy";
import {
  loadVaultIdleLock,
  saveVaultIdleLock,
  type VaultIdleLock,
} from "@/lib/vault/prefs";
import { formatRecoveryCode } from "@/lib/vault/recovery";
import {
  changeVaultPassphrase,
  isVaultUnlocked,
  regenerateVaultRecovery,
} from "@/lib/vault/session";
import {
  SETTINGS_TOAST,
  showSettingsError,
  showSettingsSuccess,
} from "@/lib/ui/settingsToast";

type Props = {
  previewMode?: boolean;
  onCreate?: () => void;
  onUnlock?: () => void;
  onLock?: () => void;
};

export function VaultSettingsSection({
  previewMode = false,
  onCreate,
  onUnlock,
  onLock,
}: Props) {
  const [hasVault, setHasVault] = useState(false);
  const [idle, setIdle] = useState<VaultIdleLock>(() => loadVaultIdleLock());
  const [pass, setPass] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [passStatus, setPassStatus] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unlocked = isVaultUnlocked();

  useEffect(() => {
    if (previewMode) return;
    void fetchUserVault()
      .then((row) => setHasVault(Boolean(row)))
      .catch(() => setHasVault(false));
  }, [previewMode, unlocked]);

  return (
    <section className="settings-section">
      <h3>
        Vault
        <SettingsInfo text="An optional folder whose titles and essay bodies are encrypted in this browser before they are stored. Images stay as ordinary files. The passphrase is separate from your sign-in password. Available on every account." />
      </h3>
      <p className="settings-help">{VAULT_WHAT_WE_SAY}</p>
      {previewMode ? (
        <p className="settings-help">Sign in to create or unlock a vault.</p>
      ) : !hasVault ? (
        <button
          type="button"
          className="rounded border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
          onClick={onCreate}
        >
          Create vault
        </button>
      ) : (
        <>
          <p className="settings-help">
            {unlocked ? "Unlocked on this device." : "Locked."}
          </p>
          <div className="flex flex-wrap gap-2">
            {unlocked ? (
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
                onClick={onLock}
              >
                Lock now
              </button>
            ) : (
              <button
                type="button"
                className="rounded border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
                onClick={onUnlock}
              >
                Unlock
              </button>
            )}
          </div>

          <label className="settings-row settings-row-stack mt-3">
            <span>Idle lock</span>
            <select
              className="settings-text-input"
              value={idle}
              onChange={(e) => {
                const next = e.target.value as VaultIdleLock;
                setIdle(next);
                saveVaultIdleLock(next);
              }}
            >
              <option value="off">Off</option>
              <option value="15m">15 minutes</option>
              <option value="1h">1 hour</option>
              <option value="8h">8 hours</option>
            </select>
          </label>
          <p className="settings-help">
            Off by default so a long editing session is not interrupted.
          </p>

          {unlocked && (
            <>
              <label className="settings-row settings-row-stack mt-3">
                <span>Change passphrase</span>
                <input
                  type="password"
                  className="settings-text-input"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="settings-row settings-row-stack">
                <span>Confirm</span>
                <input
                  type="password"
                  className="settings-text-input"
                  value={passConfirm}
                  onChange={(e) => setPassConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                disabled={busy || !pass}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    setPassStatus(null);
                    try {
                      if (pass !== passConfirm) {
                        setPassStatus("The two passphrases do not match.");
                        return;
                      }
                      await changeVaultPassphrase(pass);
                      setPass("");
                      setPassConfirm("");
                      showSettingsSuccess(
                        "Passphrase updated.",
                        SETTINGS_TOAST.vault
                      );
                    } catch (err) {
                      showSettingsError(
                        err,
                        "Could not change passphrase.",
                        SETTINGS_TOAST.vault
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                Save passphrase
              </button>
              <button
                type="button"
                className="ml-2 rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      const code = await regenerateVaultRecovery();
                      setRecovery(formatRecoveryCode(code));
                      showSettingsSuccess(
                        "New recovery code. Store it; the old one no longer works.",
                        SETTINGS_TOAST.vault
                      );
                    } catch (err) {
                      showSettingsError(
                        err,
                        "Could not make a new recovery code.",
                        SETTINGS_TOAST.vault
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                New recovery code
              </button>
              {recovery && (
                <p className="mt-2 break-all font-mono text-sm">{recovery}</p>
              )}
              {passStatus && (
                <p className="mt-2 text-xs text-muted">{passStatus}</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
