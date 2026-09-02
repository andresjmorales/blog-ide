"use client";

type Props = {
  label: string;
  /** Live seconds until the next automatic try; null while a try is in flight. */
  retryInSec?: number | null;
};

/**
 * Centered editor-pane status while the workspace tree has not loaded yet.
 * Replaces a static "Loading workspace…" so hung networks are obvious.
 */
export function WorkspaceBootSplash({ label, retryInSec = null }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
        BlogIDE
      </p>
      <p className="text-sm text-muted" role="status" aria-live="polite">
        {label}
      </p>
      {retryInSec != null && retryInSec > 0 ? (
        <p className="mt-2 font-mono text-2xl tabular-nums text-foreground">
          {retryInSec}
        </p>
      ) : null}
    </div>
  );
}
