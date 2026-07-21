"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { PanelCaret } from "@/components/icons";

export type OutlineHeading = {
  level: number;
  text: string;
  pos: number;
};

function collectHeadings(editor: Editor): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = Number(node.attrs.level ?? 1);
    const text = node.textContent.trim();
    if (!text) return;
    headings.push({ level, text, pos });
  });
  return headings;
}

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
  const headings = useEditorState({
    editor,
    selector: ({ editor: current }) => collectHeadings(current),
  });

  const minLevel =
    headings.length > 0
      ? Math.min(...headings.map((h) => h.level))
      : 1;

  function scrollTo(pos: number) {
    editor.chain().focus().setTextSelection(pos + 1).run();
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      editor.view.dispatch(editor.state.tr.scrollIntoView());
    }
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
      )}
    </aside>
  );
}
