"use client";

import { useEffect, useId, useState } from "react";
import {
  VAULT_PASSPHRASE_HINT,
  VAULT_STAY_UNLOCKED_HINT,
} from "@/lib/vault/copy";
import type { UserVaultRow } from "@/lib/vault/api";
import {
  changeVaultPassphrase,
  unlockWithPassphrase,
  unlockWithRecovery,
} from "@/lib/vault/session";

type Props = {
  open: boolean;
  row: UserVaultRow | null;
  onClose: () => void;
  onUnlocked: () => void;
};

export function VaultUnlockDialog({ open, row, onClose, onUnlocked }: Props) {
  const titleId = useId();
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [secret, setSecret] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [persist, setPersist] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needNewPass, setNeedNewPass] = useState(false);

  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => {
      setMode("passphrase");
      setSecret("");
      setNewPass("");
      setNewConfirm("");
      setPersist(true);
      setBusy(false);
      setError(null);
      setNeedNewPass(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open || !row) return null;

  async function handleUnlock() {
    if (!row) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "passphrase") {
        await unlockWithPassphrase(row, secret, persist);
        onUnlocked();
        onClose();
        return;
      }
      await unlockWithRecovery(row, secret, persist);
      setNeedNewPass(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not unlock the vault."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleNewPassphrase() {
    setError(null);
    if (newPass.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (newPass !== newConfirm) {
      setError("The two passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      await changeVaultPassphrase(newPass);
      onUnlocked();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not set a new passphrase."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-dialog-overlay" role="presentation">
      <button
        type="button"
        className="app-dialog-backdrop"
        aria-label="Dismiss dialog"
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="app-dialog">
        <h2 id={titleId} className="app-dialog-title">
          {needNewPass ? "Set a new passphrase" : "Unlock vault"}
        </h2>

        {needNewPass ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleNewPassphrase();
            }}
          >
            <p className="app-dialog-message">
              The recovery code worked. Choose a new passphrase for everyday use.
            </p>
            <label className="mb-3 block text-sm">
              <span className="mb-1.5 block">New passphrase</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="app-dialog-input"
              />
            </label>
            <label className="mb-3 block text-sm">
              <span className="mb-1.5 block">Confirm</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newConfirm}
                onChange={(e) => setNewConfirm(e.target.value)}
                className="app-dialog-input"
              />
            </label>
            {error && (
              <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="app-dialog-actions">
              <button type="submit" className="app-dialog-btn is-primary" disabled={busy}>
                {busy ? "Saving…" : "Save passphrase"}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleUnlock();
            }}
          >
            <p className="app-dialog-message">
              {mode === "passphrase"
                ? VAULT_PASSPHRASE_HINT
                : "The recovery code unwraps the vault, then you set a new passphrase."}
            </p>
            {busy && mode === "passphrase" && (
              <p className="mb-2 text-sm text-muted">Deriving the key…</p>
            )}
            <label className="mb-3 block text-sm">
              <span className="mb-1.5 block">
                {mode === "passphrase" ? "Passphrase" : "Recovery code"}
              </span>
              <input
                type={mode === "passphrase" ? "password" : "text"}
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="app-dialog-input"
                autoFocus
              />
            </label>
            <label className="mb-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
              />
              <span>{VAULT_STAY_UNLOCKED_HINT}</span>
            </label>
            {error && (
              <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <p className="mb-3 text-sm">
              <button
                type="button"
                className="text-accent underline underline-offset-4"
                onClick={() => {
                  setMode(mode === "passphrase" ? "recovery" : "passphrase");
                  setSecret("");
                  setError(null);
                }}
              >
                {mode === "passphrase" ? "Forgot passphrase?" : "Use passphrase"}
              </button>
            </p>
            <div className="app-dialog-actions">
              <button type="button" className="app-dialog-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="app-dialog-btn is-primary" disabled={busy || !secret.trim()}>
                {busy ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
