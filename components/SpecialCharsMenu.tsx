"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";

type CharItem = {
  label: string;
  insert: string;
  title: string;
  /** Wrap the current selection: insert before + selection + after. */
  wrap?: { before: string; after: string };
};

type CharGroup = {
  heading: string;
  items: CharItem[];
};

const GROUPS: CharGroup[] = [
  {
    heading: "Punctuation",
    items: [
      { label: "–", insert: "–", title: "En dash (ranges: 2010–2020)" },
      { label: "—", insert: "—", title: "Em dash (aside—like this)" },
      { label: "…", insert: "…", title: "Ellipsis" },
      { label: "“ ”", insert: "“”", title: "Curly double quotes", wrap: { before: "“", after: "”" } },
      { label: "‘ ’", insert: "‘’", title: "Curly single quotes", wrap: { before: "‘", after: "’" } },
      { label: "« »", insert: "«»", title: "Guillemets", wrap: { before: "«", after: "»" } },
      { label: "·", insert: "·", title: "Middle dot" },
      { label: "§", insert: "§", title: "Section sign" },
      { label: "¶", insert: "¶", title: "Pilcrow / paragraph mark" },
      { label: "†", insert: "†", title: "Dagger (footnote alternative)" },
      { label: "‡", insert: "‡", title: "Double dagger" },
    ],
  },
  {
    heading: "Superscript / subscript",
    items: [
      { label: "¹", insert: "¹", title: "Superscript 1" },
      { label: "²", insert: "²", title: "Superscript 2" },
      { label: "³", insert: "³", title: "Superscript 3" },
      { label: "ⁿ", insert: "ⁿ", title: "Superscript n" },
      { label: "₀", insert: "₀", title: "Subscript 0" },
      { label: "₁", insert: "₁", title: "Subscript 1" },
      { label: "₂", insert: "₂", title: "Subscript 2" },
      { label: "ₓ", insert: "ₓ", title: "Subscript x" },
    ],
  },
  {
    heading: "Accents (base + mark)",
    items: [
      { label: "´", insert: "\u0301", title: "Acute — type a letter, then this (é)" },
      { label: "`", insert: "\u0300", title: "Grave — type a letter, then this (è)" },
      { label: "ˆ", insert: "\u0302", title: "Circumflex — type a letter, then this (ê)" },
      { label: "¨", insert: "\u0308", title: "Umlaut/diaeresis — type a letter, then this (ë)" },
      { label: "˜", insert: "\u0303", title: "Tilde — type a letter, then this (ñ)" },
      { label: "¯", insert: "\u0304", title: "Macron — type a letter, then this (ā)" },
      { label: "ˇ", insert: "\u030C", title: "Caron — type a letter, then this (č)" },
      { label: "¸", insert: "\u0327", title: "Cedilla — type a letter, then this (ç)" },
    ],
  },
  {
    heading: "Common letters",
    items: [
      { label: "é", insert: "é", title: "e acute" },
      { label: "è", insert: "è", title: "e grave" },
      { label: "ê", insert: "ê", title: "e circumflex" },
      { label: "ë", insert: "ë", title: "e umlaut" },
      { label: "à", insert: "à", title: "a grave" },
      { label: "á", insert: "á", title: "a acute" },
      { label: "ä", insert: "ä", title: "a umlaut" },
      { label: "ö", insert: "ö", title: "o umlaut" },
      { label: "ü", insert: "ü", title: "u umlaut" },
      { label: "ñ", insert: "ñ", title: "n tilde" },
      { label: "ç", insert: "ç", title: "c cedilla" },
      { label: "æ", insert: "æ", title: "ae ligature" },
      { label: "œ", insert: "œ", title: "oe ligature" },
      { label: "ß", insert: "ß", title: "eszett" },
      { label: "ø", insert: "ø", title: "o slash" },
      { label: "å", insert: "å", title: "a ring" },
    ],
  },
  {
    heading: "Symbols",
    items: [
      { label: "°", insert: "°", title: "Degree" },
      { label: "±", insert: "±", title: "Plus-minus" },
      { label: "×", insert: "×", title: "Multiplication" },
      { label: "÷", insert: "÷", title: "Division" },
      { label: "≈", insert: "≈", title: "Approximately equal" },
      { label: "≠", insert: "≠", title: "Not equal" },
      { label: "≤", insert: "≤", title: "Less than or equal" },
      { label: "≥", insert: "≥", title: "Greater than or equal" },
      { label: "→", insert: "→", title: "Right arrow" },
      { label: "←", insert: "←", title: "Left arrow" },
      { label: "©", insert: "©", title: "Copyright" },
      { label: "®", insert: "®", title: "Registered" },
      { label: "™", insert: "™", title: "Trademark" },
      { label: "€", insert: "€", title: "Euro" },
      { label: "£", insert: "£", title: "Pound" },
      { label: "½", insert: "½", title: "One half" },
      { label: "¼", insert: "¼", title: "One quarter" },
      { label: "¾", insert: "¾", title: "Three quarters" },
    ],
  },
  {
    heading: "LaTeX / math markers",
    items: [
      {
        label: "$…$",
        insert: "$$",
        title: "Inline math delimiters",
        wrap: { before: "$", after: "$" },
      },
      {
        label: "$$…$$",
        insert: "$$$$",
        title: "Display math delimiters",
        wrap: { before: "$$", after: "$$" },
      },
      { label: "\\", insert: "\\", title: "Backslash (LaTeX command start)" },
    ],
  },
];

function insertIntoEditor(editor: Editor, item: CharItem) {
  const { from, to, empty } = editor.state.selection;

  if (item.wrap) {
    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent(item.wrap.before + item.wrap.after)
        .setTextSelection(from + item.wrap.before.length)
        .run();
    } else {
      const selected = editor.state.doc.textBetween(from, to, "");
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from, to },
          item.wrap.before + selected + item.wrap.after
        )
        .run();
    }
    return;
  }

  editor.chain().focus().insertContent(item.insert).run();
}

export function SpecialCharsMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as globalThis.Node)
      ) {
        setOpen(false);
      }
    }
    // Capture Escape first so a parent surface (e.g. footnote card) does not
    // also close — sequential inserts should stay available until Escape or
    // an outside click (including back into the editor text).
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="special-chars relative">
      <button
        type="button"
        title="Special characters, dashes, accents, LaTeX"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className={`min-w-8 rounded px-2 py-1 text-muted hover:bg-panel hover:text-foreground ${
          open ? "bg-accent/15 text-accent" : ""
        }`}
      >
        Ω
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Special characters"
          className="special-chars-panel absolute left-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-border bg-background p-3 shadow-lg"
        >
          <p className="mb-2 text-[0.68rem] uppercase tracking-wider text-muted">
            Insert at cursor · accents apply to the previous letter
          </p>
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {GROUPS.map((group) => (
              <section key={group.heading}>
                <h3 className="mb-1.5 text-[0.68rem] font-medium uppercase tracking-wider text-muted">
                  {group.heading}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {group.items.map((item) => (
                    <button
                      key={`${group.heading}-${item.label}`}
                      type="button"
                      title={item.title}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        insertIntoEditor(editor, item);
                      }}
                      className="min-w-8 rounded border border-border bg-panel px-2 py-1 text-sm hover:border-accent hover:text-accent"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
