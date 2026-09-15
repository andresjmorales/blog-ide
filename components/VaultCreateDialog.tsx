"use client";

import { useEffect, useId, useState } from "react";
import {
  VAULT_LOSS_STATEMENT,
  VAULT_PASSPHRASE_HINT,
} from "@/lib/vault/copy";
import {
  formatRecoveryCode,
  recoveryConfirmSegment,
} from "@/lib/vault/recovery";
import { createVault } from "@/lib/vault/session";
import { useArmedWhenOpen } from "@/lib/ui/useArmedWhenOpen";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function VaultCreateDialog({ open, onClose, onCreated }: Props) {
  const titleId = useId();
  const armed = useArmedWhenOpen(open);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recovery, setRecovery] = useState("");
  const [segment, setSegment] = useState("");
  const [typedSegment, setTypedSegment] = useState("");
  const [ack, setAck] = useState(false);
  const [persist, setPersist] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => {
      setStep(1);
      setPassphrase("");
      setConfirm("");
      setRecovery("");
      setSegment("");
      setTypedSegment("");
      setAck(false);
      setPersist(true);
      setBusy(false);
      setError(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  async function handleCreate() {
    if (!armed) return;
    setError(null);
    if (passphrase.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (passphrase !== confirm) {
      setError("The two passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await createVault({ passphrase, persist });
      const formatted = formatRecoveryCode(result.recoveryCode);
      setRecovery(formatted);
      setSegment(recoveryConfirmSegment(formatted));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the vault.");
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
          {step === 1 ? "Create a vault" : step === 2 ? "Recovery code" : "One last check"}
        </h2>

        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <p className="app-dialog-message">{VAULT_PASSPHRASE_HINT}</p>
            <label className="mb-3 block text-sm">
              <span className="mb-1.5 block">Passphrase</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="app-dialog-input"
              />
            </label>
            <label className="mb-3 block text-sm">
              <span className="mb-1.5 block">Confirm passphrase</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="app-dialog-input"
              />
            </label>
            <label className="mb-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
              />
              <span>Stay unlocked on this device</span>
            </label>
            {error && (
              <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="app-dialog-actions">
              <button type="button" className="app-dialog-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="app-dialog-btn is-primary" disabled={busy || !armed}>
                {busy ? "Creating…" : "Create vault"}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typedSegment.trim().toUpperCase() !== segment.toUpperCase()) {
                setError("That segment does not match. Copy the code somewhere safe, then try again.");
                return;
              }
              setError(null);
              setStep(3);
            }}
          >
            <p className="app-dialog-message">
              Write this recovery code down or store it in a password manager. It
              is shown once.
            </p>
            <p className="mb-3 break-all rounded border border-border bg-panel px-3 py-2 font-mono text-sm">
              {recovery}
            </p>
            <label className="mb-3 block text-sm">
              <span className="mb-1.5 block">Type this segment: {segment}</span>
              <input
                value={typedSegment}
                onChange={(e) => setTypedSegment(e.target.value)}
                className="app-dialog-input"
                autoComplete="off"
              />
            </label>
            {error && (
              <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="app-dialog-actions">
              <button type="submit" className="app-dialog-btn is-primary">
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div>
            <p className="app-dialog-message">{VAULT_LOSS_STATEMENT}</p>
            <label className="mb-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              <span>I understand there is no reset.</span>
            </label>
            <div className="app-dialog-actions">
              <button
                type="button"
                className="app-dialog-btn is-primary"
                disabled={!ack}
                onClick={() => {
                  onCreated();
                  onClose();
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
