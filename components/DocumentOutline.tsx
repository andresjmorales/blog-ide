"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { PanelCaret } from "@/components/icons";
import {
  collectRangeStats,
  formatReadingTime,
  formatWordCount,
  type DocumentStats,
} from "@/lib/editor/documentStats";
import {
  outlineSnapshotsEqual,
  takeOutlineSnapshot,
  type OutlineHeading,
  type OutlineSnapshot,
} from "@/lib/editor/documentOutline";
import {
  EDITOR_WORK_MS,
  cancelEditorWork,
  scheduleEditorWork,
} from "@/lib/editor/workSchedule";
import { scrollHeadingIntoView } from "@/lib/editor/editorScroll";

type Props = {
  editor: Editor | null;
  open: boolean;
  onToggle: () => void;
};

export function DocumentOutline({ editor, open, onToggle }: Props) {
  if (!editor) {
    return (
      <aside className="doc-outline" aria-label="Document outline">
        <button
          type="button"
          className="doc-outline-toggle"
          onClick={onToggle}
          aria-expanded={open}
          title={open ? "Hide outline" : "Show outline"}
        >
          <span className="doc-outline-toggle-label">Outline</span>
          <PanelCaret direction={open ? "left" : "right"} />
        </button>
      </aside>
    );
  }

  return (
    <DocumentOutlineLive
      editor={editor}
      open={open}
      onToggle={onToggle}
    />
  );
}

function DocumentOutlineLive({
  editor,
  open,
  onToggle,
}: {
  editor: Editor;
  open: boolean;
  onToggle: () => void;
}) {
  const [snapshot, setSnapshot] = useState<OutlineSnapshot>(() =>
    takeOutlineSnapshot(editor.state.doc)
  );

  useEffect(() => {
    const workId = `outline-${editor.view.dom.id || "essay"}`;
    const refresh = () => {
      const next = takeOutlineSnapshot(editor.state.doc);
      setSnapshot((prev) => (outlineSnapshotsEqual(prev, next) ? prev : next));
    };
    const onUpdate = () => {
      scheduleEditorWork(workId, EDITOR_WORK_MS.outlineStats, refresh);
    };
    refresh();
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      cancelEditorWork(workId);
    };
  }, [editor]);

  const [hasSelection, setHasSelection] = useState(false);
  /** One-shot selection readout; cleared by the next editor or page action. */
  const [selectionStats, setSelectionStats] = useState<DocumentStats | null>(
    null
  );

  useEffect(() => {
    const onSelection = () => {
      setHasSelection(!editor.state.selection.empty);
      setSelectionStats(null);
    };
    onSelection();
    editor.on("selectionUpdate", onSelection);
    editor.on("update", onSelection);
    return () => {
      editor.off("selectionUpdate", onSelection);
      editor.off("update", onSelection);
    };
  }, [editor]);

  useEffect(() => {
    if (!selectionStats) return;
    const clear = () => setSelectionStats(null);
    // Arm after the click that opened the readout has finished.
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", clear, true);
      window.addEventListener("keydown", clear, true);
      window.addEventListener("wheel", clear, { capture: true, passive: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", clear, true);
      window.removeEventListener("keydown", clear, true);
      window.removeEventListener("wheel", clear, true);
    };
  }, [selectionStats]);

  function showSelectionStats() {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    setSelectionStats(collectRangeStats(editor.state.doc, from, to));
  }

  const headings = snapshot.headings;
  const stats = selectionStats ?? snapshot.stats;

  const minLevel =
    headings.length > 0
      ? Math.min(...headings.map((h: OutlineHeading) => h.level))
      : 1;

  function scrollTo(pos: number) {
    const inner = Math.min(pos + 1, editor.state.doc.content.size);
    editor
      .chain()
      .setTextSelection(inner)
      .focus(null, { scrollIntoView: false })
      .run();
    scrollHeadingIntoView(editor, pos);
  }

  return (
    <aside
      className={`doc-outline ${open ? "is-open" : ""}`}
      aria-label="Document outline"
    >
      <button
        type="button"
        className="doc-outline-toggle"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? "Hide outline" : "Show outline"}
      >
        <span className="doc-outline-toggle-label">Outline</span>
        <PanelCaret direction={open ? "left" : "right"} />
      </button>

      {open && (
        <>
          <nav className="doc-outline-nav">
            {headings.length === 0 ? (
              <p className="doc-outline-empty">
                Headings in this essay will show up here.
              </p>
            ) : (
              <ul className="doc-outline-list">
                {headings.map((heading) => {
                  const depth = Math.max(0, heading.level - minLevel);
                  return (
                    <li key={`${heading.pos}-${heading.text}`}>
                      <button
                        type="button"
                        className="doc-outline-item"
                        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
                        onClick={() => scrollTo(heading.pos)}
                        title={heading.text}
                      >
                        {heading.text}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
          <DocumentStatsFooter
            stats={stats}
            isSelection={selectionStats != null}
            canShowSelection={hasSelection}
            onShowSelection={showSelectionStats}
          />
        </>
      )}

      {!open && (
        <p
          className="doc-outline-collapsed-words"
          title={formatWordCount(stats.words)}
        >
          {stats.words.toLocaleString("en-US")}
        </p>
      )}
    </aside>
  );
}

function DocumentStatsFooter({
  stats,
  isSelection,
  canShowSelection,
  onShowSelection,
}: {
  stats: DocumentStats;
  isSelection: boolean;
  canShowSelection: boolean;
  onShowSelection: () => void;
}) {
  return (
    <div
      className={`doc-stats ${isSelection ? "is-selection" : ""}`}
      aria-label={isSelection ? "Selection stats" : "Writing stats"}
      aria-live="polite"
    >
      <div className="doc-stats-primary">
        <div className="doc-stats-heading">
          <span className="doc-stats-words">
            {formatWordCount(stats.words)}
          </span>
          {isSelection ? (
            <span className="doc-stats-scope">Selection</span>
          ) : (
            canShowSelection && (
              <button
                type="button"
                className="doc-stats-selection-btn"
                // Keep the editor selection intact.
                onMouseDown={(event) => event.preventDefault()}
                onClick={onShowSelection}
                title="Count the selected text (returns to the essay on your next action)"
              >
                Selection
              </button>
            )
          )}
        </div>
        <span className="doc-stats-read">
          {formatReadingTime(stats.readingMinutes, stats.words)}
        </span>
      </div>
      <dl className="doc-stats-grid">
        <div>
          <dt>Characters</dt>
          <dd>{stats.characters.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Paragraphs</dt>
          <dd>{stats.paragraphs.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Headings</dt>
          <dd>{stats.headings.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>No spaces</dt>
          <dd>{stats.charactersNoSpaces.toLocaleString("en-US")}</dd>
        </div>
      </dl>
    </div>
  );
}
