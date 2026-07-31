"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { claimFloatZ } from "@/lib/pins/pinStore";

const OPTIONS: { level: 0 | 1 | 2 | 3 | 4; label: string }[] = [
  { level: 0, label: "Paragraph" },
  { level: 1, label: "Heading 1" },
  { level: 2, label: "Heading 2" },
  { level: 3, label: "Heading 3" },
  { level: 4, label: "Heading 4" },
];

export function HeadingStyleMenu({ editor }: { editor: Editor }) {
  const heading = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      ([1, 2, 3, 4] as const).find((level) =>
        current.isActive("heading", { level })
      ) ?? 0,
  });
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const [zIndex, setZIndex] = useState(50);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const label =
    OPTIONS.find((option) => option.level === heading)?.label ?? "Paragraph";

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });
    setZIndex(claimFloatZ());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as globalThis.Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function apply(level: 0 | 1 | 2 | 3 | 4) {
    setOpen(false);
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().setHeading({ level }).run();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Paragraph style"
        aria-label="Paragraph style"
        aria-haspopup="menu"
        aria-expanded={open}
        className="blogide-heading-menu-trigger"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="blogide-toolbar-menu"
            style={{ top: coords.top, left: coords.left, zIndex }}
          >
            {OPTIONS.map((option) => (
              <button
                key={option.level}
                type="button"
                role="menuitemradio"
                aria-checked={heading === option.level}
                className={
                  heading === option.level ? "is-active" : undefined
                }
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(option.level)}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
