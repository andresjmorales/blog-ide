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
      : (el.closest(".tableWrapper") ?? el);
  return wrapper instanceof HTMLElement ? wrapper : null;
}

type Control = {
  title: string;
  label: string;
  run: () => void;
};

/**
 * Floating table controls (add/remove row/col + delete table) at the
 * top-right of the table containing the caret.
 */
export function TableControls({ editor }: { editor: Editor }) {
  const inTable = useEditorState({
    editor,
    selector: ({ editor: current }) => current.isActive("table"),
  });
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(
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
        right: Math.max(8, window.innerWidth - rect.right),
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

  const controls: Control[] = [
    {
      title: "Add row below",
      label: "+R",
      run: () => editor.chain().focus().addRowAfter().run(),
    },
    {
      title: "Add column after",
      label: "+C",
      run: () => editor.chain().focus().addColumnAfter().run(),
    },
    {
      title: "Delete row",
      label: "−R",
      run: () => editor.chain().focus().deleteRow().run(),
    },
    {
      title: "Delete column",
      label: "−C",
      run: () => editor.chain().focus().deleteColumn().run(),
    },
    {
      title: "Delete table",
      label: "×",
      run: () => editor.chain().focus().deleteTable().run(),
    },
  ];

  return createPortal(
    <div
      className="blogide-table-controls"
      style={{ top: visible.top, right: visible.right }}
      role="toolbar"
      aria-label="Table"
    >
      {controls.map((control) => (
        <button
          key={control.title}
          type="button"
          title={control.title}
          aria-label={control.title}
          style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={control.run}
        >
          {control.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
