"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { cleanWhitespace } from "@/lib/editor/cleanWhitespace";
import { applyNormalizePunctuation } from "@/lib/editor/applyNormalizePunctuation";
import type { DashStyle } from "@/lib/editor/normalizePunctuation";
import {
  runPrePublishCheck,
  type PrePublishReport,
} from "@/lib/preview/runPrePublishCheck";
import {
  htmlForPublishTarget,
  PUBLISH_COPY_TARGETS,
  type PublishCopyTarget,
} from "@/lib/export/clipboardHtml";
import { copyDocumentForPaste } from "@/lib/export/document";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { BroomIcon, PinIcon } from "@/components/icons";
import { claimFloatZ } from "@/lib/pins/pinStore";

const CLEANUP_PANEL_MAX_WIDTH_PX = 440;
const CLEANUP_PANEL_EDGE_PAD_PX = 8;
const CLEANUP_PANEL_MIN_VISIBLE_HEIGHT_PX = 160;
const CLEANUP_PANEL_DEFAULT_TOP_VH = 12;

export type CleanupTab = "import" | "text" | "punctuation" | "publish";

const TABS: { id: CleanupTab; label: string }[] = [
  { id: "import", label: "Import" },
  { id: "text", label: "Text" },
  { id: "punctuation", label: "Punctuation" },
  { id: "publish", label: "Publish" },
];

type PopupPos = { left: number; top: number };

function applyCleanWhitespace(editor: Editor) {
  const { from, to, empty } = editor.state.selection;
  if (empty) return;
  const text = editor.state.doc.textBetween(from, to, "\n");
  const next = cleanWhitespace(text);
  if (next === text) return;
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, next)
    .setTextSelection({ from, to: from + next.length })
    .run();
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** TipTap editor when in rich-text mode; null in source view. */
  editor: Editor | null;
  initialTab?: CleanupTab;
  onFixFootnotes?: () => void | Promise<void>;
  /** Full document markdown for the Publish tab. */
  getMarkdown: () => string;
};

/**
 * Pinnable Cleanup panel with tabs: Import, Text, Punctuation, Publish.
 * Convert case stays on the toolbar Cc menu.
 */
export function CleanupDialog({
  open,
  onClose,
  editor,
  initialTab = "import",
  onFixFootnotes,
  getMarkdown,
}: Props) {
  if (!open) return null;

  return (
    <CleanupPanel
      key={`${initialTab}-${editor ? "ed" : "src"}`}
      onClose={onClose}
      editor={editor}
      initialTab={initialTab}
      onFixFootnotes={onFixFootnotes}
      getMarkdown={getMarkdown}
    />
  );
}

function CleanupPanel({
  onClose,
  editor,
  initialTab,
  onFixFootnotes,
  getMarkdown,
}: {
  onClose: () => void;
  editor: Editor | null;
  initialTab: CleanupTab;
  onFixFootnotes?: () => void | Promise<void>;
  getMarkdown: () => string;
}) {
  const titleId = useId();
  const { prefs, updatePrefs } = useEditorPrefs();
  const [tab, setTab] = useState<CleanupTab>(initialTab);
  const [pinned, setPinned] = useState(false);
  const [zIndex, setZIndex] = useState(() => claimFloatZ());
  const [position, setPosition] = useState<PopupPos | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const [publishRunId, setPublishRunId] = useState(0);

  useEffect(() => {
    if (pinned) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pinned, onClose]);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (window.innerWidth < 768) return;
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select")) return;
      const popup = popupRef.current;
      const rect = popup?.getBoundingClientRect();
      if (!rect) return;
      event.preventDefault();
      event.stopPropagation();
      setPinned(true);
      setZIndex(claimFloatZ());
      setPosition({ left: rect.left, top: rect.top });
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
    },
    []
  );

  const onDragMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = Math.min(
      CLEANUP_PANEL_MAX_WIDTH_PX,
      window.innerWidth - CLEANUP_PANEL_EDGE_PAD_PX * 2
    );
    setPosition({
      left: Math.max(
        CLEANUP_PANEL_EDGE_PAD_PX,
        Math.min(
          window.innerWidth - width - CLEANUP_PANEL_EDGE_PAD_PX,
          event.clientX - drag.offsetX
        )
      ),
      top: Math.max(
        CLEANUP_PANEL_EDGE_PAD_PX,
        Math.min(
          window.innerHeight - CLEANUP_PANEL_MIN_VISIBLE_HEIGHT_PX,
          event.clientY - drag.offsetY
        )
      ),
    });
  }, []);

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  function runDashes(style: DashStyle) {
    if (!editor) return;
    updatePrefs({ dashStyle: style });
    applyNormalizePunctuation(editor, {
      dashStyle: style,
      smartQuotes: false,
      pauseDashes: true,
    });
  }

  const popupStyle: React.CSSProperties = position
    ? {
        left: position.left,
        top: position.top,
        transform: "none",
      }
    : { top: `${CLEANUP_PANEL_DEFAULT_TOP_VH}vh` };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="blogide-cleanup-layer" style={{ zIndex }}>
      {!pinned && (
        <button
          type="button"
          className="blogide-cleanup-backdrop"
          aria-label="Close"
          onClick={onClose}
        />
      )}
      <div
        ref={popupRef}
        className="blogide-cleanup-panel"
        role="dialog"
        aria-modal={!pinned}
        aria-labelledby={titleId}
        style={popupStyle}
        onPointerDown={() => setZIndex(claimFloatZ())}
      >
        <header
          className="blogide-cleanup-bar"
          title="Drag to move"
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2 id={titleId} className="blogide-cleanup-title">
            <BroomIcon className="blogide-tool-icon" />
            Cleanup
          </h2>
          <span className="blogide-cleanup-bar-actions">
            <button
              type="button"
              className={pinned ? "is-active" : ""}
              title={pinned ? "Unpin" : "Pin"}
              aria-label={pinned ? "Unpin Cleanup" : "Pin Cleanup"}
              aria-pressed={pinned}
              onClick={() => {
                if (!pinned) {
                  const rect = popupRef.current?.getBoundingClientRect();
                  if (rect) {
                    setPosition({ left: rect.left, top: rect.top });
                  }
                  setZIndex(claimFloatZ());
                }
                setPinned((value) => !value);
              }}
            >
              <PinIcon className="blogide-tool-icon" />
            </button>
            <button
              type="button"
              aria-label="Close Cleanup"
              onClick={onClose}
            >
              ×
            </button>
          </span>
        </header>

        <div className="blogide-cleanup-tabs" role="tablist" aria-label="Cleanup">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={
                tab === item.id
                  ? "blogide-cleanup-tab is-active"
                  : "blogide-cleanup-tab"
              }
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="blogide-cleanup-body">
          {tab === "import" && (
            <section>
              <p className="blogide-cleanup-hint">
                Repair paste from Substack / Docs (footnote markers and split
                notes). May offer AI cleanup if enabled in Account settings.
              </p>
              <div className="blogide-cleanup-actions">
                <ActionButton
                  label="Fix footnotes"
                  disabled={!onFixFootnotes}
                  onClick={() => {
                    if (!onFixFootnotes) return;
                    void onFixFootnotes();
                  }}
                />
              </div>
            </section>
          )}

          {tab === "text" &&
            (editor ? (
              <TextTab editor={editor} />
            ) : (
              <p className="blogide-cleanup-hint">
                Switch to the rich text editor for text cleanup. Convert case
                is on the toolbar (Cc).
              </p>
            ))}

          {tab === "punctuation" &&
            (editor ? (
              <PunctuationTab
                editor={editor}
                dashStyle={prefs.dashStyle}
                onDashStyle={(style) => runDashes(style)}
              />
            ) : (
              <p className="blogide-cleanup-hint">
                Switch to the rich text editor for punctuation cleanup.
              </p>
            ))}

          {tab === "publish" && (
            <PublishTab
              key={publishRunId}
              getMarkdown={getMarkdown}
              onRerun={() => setPublishRunId((id) => id + 1)}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function TextTab({ editor }: { editor: Editor }) {
  const hasSelection = useEditorState({
    editor,
    selector: ({ editor: ed }) => !ed.state.selection.empty,
  });

  return (
    <section>
      <p className="blogide-cleanup-hint">
        Select text in the essay first. Convert case is on the toolbar (Cc).
      </p>
      <div className="blogide-cleanup-actions">
        <ActionButton
          label="Clean whitespace"
          hint="Collapse messy PDF / paste spaces"
          disabled={!hasSelection}
          onClick={() => applyCleanWhitespace(editor)}
        />
      </div>
    </section>
  );
}

function PunctuationTab({
  editor,
  dashStyle,
  onDashStyle,
}: {
  editor: Editor;
  dashStyle: DashStyle;
  onDashStyle: (style: DashStyle) => void;
}) {
  const { prefs } = useEditorPrefs();

  return (
    <section>
      <p className="blogide-cleanup-hint">
        Empty selection applies to the whole essay. Pause dashes only change
        spaced <code className="text-[0.7rem]"> - </code> /{" "}
        <code className="text-[0.7rem]"> – </code> (not good-faith or 12–14).
      </p>
      <div className="blogide-cleanup-actions">
        <ActionButton
          label="Smart quotes"
          hint={`"..." → “...”`}
          onClick={() => {
            applyNormalizePunctuation(editor, {
              dashStyle: prefs.dashStyle,
              smartQuotes: true,
              pauseDashes: false,
            });
          }}
        />
        <ActionButton
          label="Chicago dashes"
          hint="spaced - → —"
          onClick={() => onDashStyle("chicago")}
        />
        <ActionButton
          label="MLA dashes"
          hint="spaced - → –"
          onClick={() => onDashStyle("mla")}
        />
      </div>
      <p className="mt-2 text-[0.65rem] text-muted">
        Default dash style: {dashStyle === "chicago" ? "Chicago" : "MLA"}
      </p>
    </section>
  );
}

function PublishTab({
  getMarkdown,
  onRerun,
}: {
  getMarkdown: () => string;
  onRerun: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [report, setReport] = useState<PrePublishReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [copyBusy, setCopyBusy] = useState<PublishCopyTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    void runPrePublishCheck(getMarkdown())
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        setError(null);
        setBusy(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setReport(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not run pre-publish check."
        );
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount / remount (Re-check) only — don't re-fetch on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyFor(target: PublishCopyTarget) {
    const spec = PUBLISH_COPY_TARGETS.find((item) => item.id === target);
    setCopyBusy(target);
    setCopyStatus(null);
    try {
      const markdown = getMarkdown();
      const { html } = htmlForPublishTarget(markdown, target);
      await copyDocumentForPaste({ markdown, html });
      setCopyStatus(`Copied for ${spec?.label ?? target}.`);
    } catch {
      setCopyStatus("Copy failed. Try ⋯ → Copy all text for markdown.");
    } finally {
      setCopyBusy(null);
    }
  }

  return (
    <section>
      <p className="blogide-cleanup-hint">
        Copy a platform-specific HTML paste (GFM footnotes become that site's
        numbered notes). ⋯ Copy all text stays raw markdown.
      </p>
      <div className="blogide-cleanup-actions mb-3">
        {PUBLISH_COPY_TARGETS.map((target) => (
          <ActionButton
            key={target.id}
            label={
              copyBusy === target.id ? "Copying…" : `Copy for ${target.label}`
            }
            hint={target.hint}
            disabled={copyBusy != null}
            onClick={() => void copyFor(target.id)}
          />
        ))}
      </div>
      {copyStatus && (
        <p className="mb-3 text-xs text-muted" role="status">
          {copyStatus}
        </p>
      )}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="blogide-cleanup-hint mb-0">
          Check http(s) links and images before you publish.
        </p>
        <button
          type="button"
          className="blogide-cleanup-action shrink-0"
          disabled={busy}
          onClick={onRerun}
        >
          <span className="blogide-cleanup-action-label">
            {busy ? "Checking…" : "Re-check"}
          </span>
        </button>
      </div>
      {busy && !report && (
        <p className="text-xs text-muted">Checking links and images…</p>
      )}
      {!busy && error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {!busy && report && (
        <>
          <p className="mb-2 text-[0.65rem] text-muted">
            Checked {report.checked} http(s) URL
            {report.checked === 1 ? "" : "s"}
            {report.failed > 0
              ? ` · ${report.failed} failed`
              : report.warned === 0 && report.checked > 0
                ? " · all ok"
                : ""}
            {report.warned > 0
              ? ` · ${report.warned} may be bot-blocked`
              : ""}
            {report.skipped > 0
              ? ` · ${report.skipped} skipped / relative`
              : ""}
            .
          </p>
          {report.rows.length === 0 ? (
            <p className="text-xs text-muted">No links or images found.</p>
          ) : (
            <ul className="space-y-1.5">
              {report.rows.map((row) => (
                <li
                  key={`${row.kind}:${row.url}`}
                  className="rounded border border-border px-2 py-1.5"
                >
                  <div className="flex items-start gap-2">
                    <StatusBadge ok={row.ok} soft={row.soft} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[0.65rem]">
                        {row.url}
                      </div>
                      <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-muted">
                        {row.kind}
                        {row.status != null ? ` · HTTP ${row.status}` : ""}
                      </div>
                      {(row.error || row.note) && (
                        <div className="mt-0.5 text-[0.65rem] text-muted">
                          {row.error || row.note}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function StatusBadge({ ok, soft }: { ok: boolean | null; soft?: boolean }) {
  if (ok === true) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-emerald-700 dark:text-emerald-400">
        OK
      </span>
    );
  }
  if (ok === false && soft) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-800 dark:text-amber-300">
        Warn
      </span>
    );
  }
  if (ok === false) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:text-red-400">
        Fail
      </span>
    );
  }
  return (
    <span className="mt-0.5 shrink-0 rounded bg-panel px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted">
      Skip
    </span>
  );
}

function ActionButton({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="blogide-cleanup-action"
      title={hint || label}
    >
      <span className="blogide-cleanup-action-label">{label}</span>
      {hint ? <span className="blogide-cleanup-action-hint">{hint}</span> : null}
    </button>
  );
}

/** Toolbar trigger that opens the cleanup panel. */
export function CleanupToolbarButton({
  open,
  onOpen,
}: {
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      title="Cleanup"
      aria-label="Cleanup"
      aria-haspopup="dialog"
      aria-expanded={open}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.8125rem] leading-none ${
        open
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-panel hover:text-foreground"
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      <BroomIcon className="blogide-tool-icon" />
    </button>
  );
}
