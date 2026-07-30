"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorState, type Editor } from "@tiptap/react";

const BUTTON_SIZE = 24;
const OFFSET = 6;

function tableWrapperNearSelection(editor: Editor): HTMLElement | null {
  const { selection } = editor.state;
  const dom = editor.view.domAtPos(selection.from).node;
  const el =
    dom instanceof Element
      ? dom.closest(".tableWrapper, table")
      : dom.parentElement?.closest(".tableWrapper, table");
  if (!el) return null;
  const wrapper =
    el instanceof HTMLElement && el.classList.contains("tableWrapper")
      ? el
      : el.closest(".tableWrapper") ?? el;
  return wrapper instanceof HTMLElement ? wrapper : null;
}

/**
 * Floating delete control at the top-right of the table containing the caret.
 * Avoids forcing authors through source mode to remove a table.
 */
export function TableDeleteControl({ editor }: { editor: Editor }) {
  const inTable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isActive("table"),
  });
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    if (!inTable) return;

    function update() {
      const wrapper = tableWrapperNearSelection(editor);
      if (!wrapper) {
        setAnchor(null);
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      setAnchor({
        top: Math.max(8, rect.top - OFFSET),
        left: Math.min(
          window.innerWidth - BUTTON_SIZE - 8,
          rect.right - BUTTON_SIZE / 2
        ),
      });
    }

    update();
    const scrollParents: (Element | Window)[] = [window];
    let parent: Element | null = editor.view.dom.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (
        /(auto|scroll|overlay)/.test(
          style.overflow + style.overflowY + style.overflowX
        )
      ) {
        scrollParents.push(parent);
      }
      parent = parent.parentElement;
    }
    for (const node of scrollParents) {
      node.addEventListener("scroll", update, true);
    }
    window.addEventListener("resize", update);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      for (const node of scrollParents) {
        node.removeEventListener("scroll", update, true);
      }
      window.removeEventListener("resize", update);
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor, inTable]);

  const visible = inTable ? anchor : null;
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <button
      type="button"
      className="blogide-table-delete"
      style={{ top: visible.top, left: visible.left }}
      title="Delete table"
      aria-label="Delete table"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.chain().focus().deleteTable().run()}
    >
      ×
    </button>,
    document.body
  );
}
