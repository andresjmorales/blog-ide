"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { PanelCaret } from "@/components/icons";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import {
  collectRangeStats,
  formatReadingTime,
  formatWordCount,
  withFootnotes,
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
import { withMarkdownWords } from "@/lib/editor/markdownWordCount";

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

/** Outline snapshot with words counted the way personal-site (and Substack) do. */
function essaySnapshot(editor: Editor): OutlineSnapshot {
  const snapshot = takeOutlineSnapshot(editor.state.doc);
  return {
    ...snapshot,
    stats: withMarkdownWords(snapshot.stats, editor.getJSON()),
  };
}

function selectionSnapshotStats(
  editor: Editor,
  from: number,
  to: number
): DocumentStats {
  const { doc } = editor.state;
  return withMarkdownWords(collectRangeStats(doc, from, to), {
    type: "doc",
    content: doc.slice(from, to).content.toJSON() ?? [],
  });
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
    essaySnapshot(editor)
  );

  useEffect(() => {
    const workId = `outline-${editor.view.dom.id || "essay"}`;
    const refresh = () => {
      const next = essaySnapshot(editor);
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

  const { prefs, updatePrefs } = useEditorPrefs();
  const countFootnotes = prefs.wordCountFootnotes;

  /** Live readout of the highlighted text; null when nothing (or one word) is selected. */
  const [selectionStats, setSelectionStats] = useState<DocumentStats | null>(
    null
  );

  useEffect(() => {
    const workId = `outline-selection-${editor.view.dom.id || "essay"}`;
    const refresh = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setSelectionStats(null);
        return;
      }
      const next = selectionSnapshotStats(editor, from, to);
      const words = next.words + next.footnotes.words;
      setSelectionStats(words > 1 ? next : null);
    };
    const onSelection = () => {
      // Collapsing the selection returns to the essay at once; ranges are
      // re-measured once a drag or shift-arrow run settles.
      if (editor.state.selection.empty) {
        cancelEditorWork(workId);
        setSelectionStats(null);
        return;
      }
      scheduleEditorWork(workId, EDITOR_WORK_MS.selectionStats, refresh);
    };
    refresh();
    editor.on("selectionUpdate", onSelection);
    editor.on("update", onSelection);
    return () => {
      editor.off("selectionUpdate", onSelection);
      editor.off("update", onSelection);
      cancelEditorWork(workId);
    };
  }, [editor]);

  const headings = snapshot.headings;
  const essayStats = withFootnotes(snapshot.stats, countFootnotes);
  const stats = selectionStats
    ? withFootnotes(selectionStats, countFootnotes)
    : essayStats;
  const footnoteWords = (selectionStats ?? snapshot.stats).footnotes.words;

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
            footnoteWords={footnoteWords}
            countFootnotes={countFootnotes}
            onCountFootnotesChange={(next) =>
              updatePrefs({ wordCountFootnotes: next })
            }
          />
        </>
      )}

      {!open && (
        <p
          className="doc-outline-collapsed-words"
          title={formatWordCount(essayStats.words)}
        >
          {essayStats.words.toLocaleString("en-US")}
        </p>
      )}
    </aside>
  );
}

function DocumentStatsFooter({
  stats,
  isSelection,
  footnoteWords,
  countFootnotes,
  onCountFootnotesChange,
}: {
  stats: DocumentStats;
  isSelection: boolean;
  footnoteWords: number;
  countFootnotes: boolean;
  onCountFootnotesChange: (next: boolean) => void;
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
          {isSelection && (
            <span className="doc-stats-scope">Selection</span>
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
      <label
        className="doc-stats-footnotes"
        title="Include footnote text in the word count, characters, and reading time"
        // Keep the editor selection intact.
        onMouseDown={(event) => event.preventDefault()}
      >
        <input
          type="checkbox"
          checked={countFootnotes}
          onChange={(event) => onCountFootnotesChange(event.target.checked)}
        />
        <span>Count footnotes</span>
        <span className="doc-stats-footnotes-n">
          {footnoteWords.toLocaleString("en-US")}
        </span>
      </label>
    </div>
  );
}
