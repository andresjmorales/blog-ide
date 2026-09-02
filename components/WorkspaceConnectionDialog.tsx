"use client";

import Link from "next/link";
import {
  workspaceFailureUserCopy,
  type WorkspaceFailureKind,
} from "@/lib/workspace/connectionError";

type Props = {
  open: boolean;
  kind: WorkspaceFailureKind;
  /** Raw error for optional detail (collapsed). */
  detail?: string | null;
  onRetry: () => void;
  retrying?: boolean;
  /** Automatic retry countdown (seconds). */
  retryInSec?: number | null;
  /** Open the last essay cached on this device without a cloud tree. */
  onContinueOffline?: (() => void) | null;
};

/**
 * Blocking overlay when workspace bootstrap fails. Dims the shell so the
 * user can’t poke Files / AI / etc. until they retry or leave for help.
 */
export function WorkspaceConnectionDialog({
  open,
  kind,
  detail,
  onRetry,
  retrying = false,
  retryInSec = null,
  onContinueOffline = null,
}: Props) {
  if (!open) return null;

  const { title, summary } = workspaceFailureUserCopy(kind);

  return (
    <div className="workspace-connection-overlay" role="presentation">
      <div className="workspace-connection-backdrop" aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="workspace-connection-title"
        aria-describedby="workspace-connection-summary"
        className="workspace-connection-dialog"
      >
        <h2 id="workspace-connection-title" className="app-dialog-title">
          {title}
        </h2>
        <p id="workspace-connection-summary" className="app-dialog-message">
          {summary}
        </p>

        <ul className="workspace-connection-tips">
          <li>Try a phone hotspot or leave your VPN.</li>
          <li>Reload the page, or sign out and sign back in.</li>
          <li>
            On locked-down PCs, ask IT to allow{" "}
            <code>*.supabase.co</code> (and disable SSL inspection for it if
            needed).
          </li>
        </ul>

        <p className="workspace-connection-help">
          <Link href="/help/connection" target="_blank" rel="noreferrer">
            Open troubleshooting guide
          </Link>
        </p>

        {detail ? (
          <details className="workspace-connection-detail">
            <summary>Technical details</summary>
            <pre>{detail}</pre>
          </details>
        ) : null}

        {retryInSec != null && retryInSec > 0 && !retrying ? (
          <p className="workspace-connection-retry" role="status" aria-live="polite">
            Retrying in {retryInSec}…
          </p>
        ) : null}

        <div className="app-dialog-actions">
          <button
            type="button"
            className="app-dialog-btn"
            onClick={() => window.location.assign("/")}
          >
            Leave editor
          </button>
          {onContinueOffline ? (
            <button
              type="button"
              className="app-dialog-btn"
              onClick={onContinueOffline}
            >
              Open last essay on this device
            </button>
          ) : null}
          <button
            type="button"
            className="app-dialog-btn is-primary"
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      </div>
    </div>
  );
}
