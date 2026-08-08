"use client";

import { useEffect, useMemo, useState } from "react";
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";
import {
  fetchRemoteDocument,
  resolveDocumentConflict,
} from "@/lib/workspace/api";
import type {
  ConflictResolution,
  RemoteDocument,
  WorkspaceNode,
} from "@/lib/workspace/types";

export type ConflictResolutionSuccess = {
  copyId: string;
  originId: string;
  resolution: ConflictResolution;
  version: number;
};

type Props = {
  open: boolean;
  copyNode: WorkspaceNode | null;
  originNode?: WorkspaceNode | null;
  onClose: () => void;
  onResolved: (result: ConflictResolutionSuccess) => void | Promise<void>;
};

function resolutionError(reason: string): string {
  switch (reason) {
    case "conflict":
      return "The cloud version changed while this review was open. Close and review the latest versions before choosing again.";
    case "already_resolved":
      return "This conflict was already resolved in another tab or device.";
    case "origin_not_found":
      return "The original document is no longer available.";
    case "quota":
      return "Using the local version would exceed your storage quota.";
    case "trash_unavailable":
      return "The conflict copy could not be moved to Trash.";
    default:
      return `Could not resolve this conflict (${reason}).`;
  }
}

export function ConflictResolverPanel({
  open,
  copyNode,
  originNode = null,
  onClose,
  onResolved,
}: Props) {
  const [origin, setOrigin] = useState<RemoteDocument | null>(null);
  const [copy, setCopy] = useState<RemoteDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<ConflictResolution | null>(null);
  const [error, setError] = useState<string | null>(null);

  const originId = copyNode?.conflict_of ?? null;

  useEffect(() => {
    if (!open || !copyNode || !originId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setResolving(null);
      setError(null);
      setOrigin(null);
      setCopy(null);
      void Promise.all([
        fetchRemoteDocument(originId),
        fetchRemoteDocument(copyNode.id),
      ])
        .then(([nextOrigin, nextCopy]) => {
          if (cancelled) return;
          if (!nextOrigin || !nextCopy) {
            throw new Error(
              !nextOrigin
                ? "The original document is no longer available."
                : "The local conflict copy is no longer available."
            );
          }
          setOrigin(nextOrigin);
          setCopy(nextCopy);
        })
        .catch((cause) => {
          if (!cancelled) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not load conflict versions."
            );
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, copyNode, originId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !resolving) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, resolving]);

  const diff = useMemo(
    () =>
      origin && copy
        ? compactDiff(unifiedLineDiff(origin.markdown, copy.markdown), 3)
        : [],
    [origin, copy]
  );

  if (!open || !copyNode) return null;

  async function resolve(resolution: ConflictResolution) {
    if (!origin || !copy || !originId) return;
    setResolving(resolution);
    setError(null);
    try {
      const result = await resolveDocumentConflict(
        copyNode!.id,
        resolution,
        resolution === "use_mine" ? Number(origin.version) : undefined
      );
      if (!result.ok) {
        throw new Error(resolutionError(result.reason));
      }
      await onResolved({
        copyId: result.copyId,
        originId: result.originId,
        resolution: result.resolution,
        version: result.version,
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not resolve conflict."
      );
    } finally {
      setResolving(null);
    }
  }

  const busy = resolving !== null;
  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close conflict review"
        onClick={busy ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-resolver-title"
        className="settings-panel"
        style={{
          width: "min(68rem, calc(100vw - 1.5rem))",
          maxHeight: "calc(100dvh - 1.5rem)",
        }}
      >
        <div className="settings-panel-header">
          <div>
            <h2 id="conflict-resolver-title">Review conflict</h2>
            <p className="mt-1 text-xs text-muted">
              {originNode?.name ?? "Original"} versus {copyNode.name}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <section className="settings-section">
          <p className="settings-help">
            Both versions are safe in the cloud until you choose. Keep cloud
            and Use mine move the conflict copy to Trash; Keep both retains it
            as a labeled Local copy. Use mine only succeeds if the original has
            not changed since this comparison loaded.
          </p>
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {loading && <p className="settings-help">Loading both versions…</p>}

          {origin && copy && (
            <>
              <div className="grid min-h-0 gap-3 md:grid-cols-2">
                <VersionColumn
                  label="Cloud / original"
                  detail={`v${origin.version}`}
                  markdown={origin.markdown}
                />
                <VersionColumn
                  label="Local / conflict"
                  detail="preserved copy"
                  markdown={copy.markdown}
                />
              </div>

              <div className="mt-4">
                <h3>Changes</h3>
                <p className="settings-help">
                  Red lines exist only in Cloud; green lines exist only in
                  Local.
                </p>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded border border-border bg-panel p-3 font-mono text-xs leading-snug">
                  {diff.length === 0 ? (
                    <span className="text-muted">No line-level differences.</span>
                  ) : (
                    diff.map((line, index) => (
                      <div
                        key={`${line.type}-${index}`}
                        className={
                          line.type === "add"
                            ? "text-green-700 dark:text-green-300"
                            : line.type === "remove"
                              ? "text-red-700 dark:text-red-300"
                              : "text-muted"
                        }
                      >
                        {line.type === "add"
                          ? `+ ${line.text}`
                          : line.type === "remove"
                            ? `- ${line.text}`
                            : `  ${line.text}`}
                      </div>
                    ))
                  )}
                </pre>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-panel disabled:opacity-50"
                  onClick={() => void resolve("keep_cloud")}
                >
                  {resolving === "keep_cloud" ? "Keeping cloud…" : "Keep cloud"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-panel disabled:opacity-50"
                  onClick={() => void resolve("keep_both")}
                >
                  {resolving === "keep_both" ? "Keeping both…" : "Keep both"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  onClick={() => void resolve("use_mine")}
                >
                  {resolving === "use_mine" ? "Using mine…" : "Use mine"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function VersionColumn({
  label,
  detail,
  markdown,
}: {
  label: string;
  detail: string;
  markdown: string;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <strong>{label}</strong>
        <span className="text-muted">{detail}</span>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border bg-panel p-3 font-mono text-xs leading-snug">
        {markdown}
      </pre>
    </section>
  );
}
