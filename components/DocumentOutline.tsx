"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { PanelCaret } from "@/components/icons";
import {
  formatReadingTime,
  formatWordCount,
  type DocumentStats,
} from "@/lib/editor/documentStats";
import {
  OUTLINE_REFRESH_MS,
  outlineSnapshotsEqual,
  takeOutlineSnapshot,
  type OutlineHeading,
  type OutlineSnapshot,
} from "@/lib/editor/documentOutline";
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
    let timer = 0;
    const refresh = () => {
      const next = takeOutlineSnapshot(editor.state.doc);
      setSnapshot((prev) => (outlineSnapshotsEqual(prev, next) ? prev : next));
    };
    const onUpdate = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, OUTLINE_REFRESH_MS);
    };
    refresh();
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (timer) window.clearTimeout(timer);
    };
  }, [editor]);

  const headings = snapshot.headings;
  const stats = snapshot.stats;

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
          <DocumentStatsFooter stats={stats} />
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

function DocumentStatsFooter({ stats }: { stats: DocumentStats }) {
  return (
    <div className="doc-stats" aria-label="Writing stats">
      <div className="doc-stats-primary">
        <span className="doc-stats-words">{formatWordCount(stats.words)}</span>
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
