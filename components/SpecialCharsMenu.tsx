"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { claimFloatZ } from "@/lib/pins/pinStore";

type CharItem = {
  label: string;
  insert: string;
  title: string;
  /** Wrap the current selection: insert before + selection + after. */
  wrap?: { before: string; after: string };
  /** Span roughly two character tiles in the flex wrap. */
  wide?: boolean;
};

type ActionItem = {
  label: string;
  title: string;
  wide?: boolean;
  run: (editor: Editor) => void;
};

type CharGroup = {
  heading: string;
  items: CharItem[];
  /** Editor actions shown alongside glyphs (e.g. Divider / HR). */
  actions?: ActionItem[];
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
    actions: [
      {
        label: "Divider",
        title: "Horizontal rule / thematic break",
        wide: true,
        run: (editor) => {
          editor.chain().focus().setHorizontalRule().run();
        },
      },
    ],
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

const PANEL_WIDTH = 352;
const PANEL_MAX_HEIGHT = 420;
const VIEWPORT_PAD = 12;

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

function tileClass(wide?: boolean) {
  return `rounded border border-border bg-panel px-2 py-1 text-sm hover:border-accent hover:text-accent ${
    wide ? "min-w-[4.75rem] px-3" : "min-w-8"
  }`;
}

type PanelPos = { top: number; left: number; maxHeight: number };

export function SpecialCharsMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [panelZ, setPanelZ] = useState(80);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function closeMenu() {
    setOpen(false);
    setPos(null);
  }

  function openMenu() {
    setPanelZ(claimFloatZ());
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
      let left = rect.left;
      if (left + width > window.innerWidth - VIEWPORT_PAD) {
        left = Math.max(VIEWPORT_PAD, rect.right - width);
      }
      left = Math.max(VIEWPORT_PAD, left);

      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
      const spaceAbove = rect.top - VIEWPORT_PAD;
      const preferBelow =
        spaceBelow >= Math.min(220, PANEL_MAX_HEIGHT) ||
        spaceBelow >= spaceAbove;
      const available = Math.max(0, preferBelow ? spaceBelow : spaceAbove);
      // Fit the viewport gap; never invent more height than we have.
      const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(120, available - 4));
      const panelHeight = Math.min(
        panelRef.current?.offsetHeight ?? maxHeight,
        maxHeight
      );
      let top = preferBelow ? rect.bottom + 4 : rect.top - panelHeight - 4;
      top = Math.min(
        Math.max(VIEWPORT_PAD, top),
        window.innerHeight - VIEWPORT_PAD - Math.min(panelHeight, maxHeight)
      );

      setPos((prev) => {
        if (
          prev &&
          prev.top === top &&
          prev.left === left &&
          prev.maxHeight === maxHeight
        ) {
          return prev;
        }
        return { top, left, maxHeight };
      });
    }

    // Defer setState out of the effect body (react-hooks/set-state-in-effect).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      place();
      // Re-measure after the portaled panel mounts so flip-up uses real height.
      raf2 = requestAnimationFrame(place);
    });
    window.addEventListener("resize", place);
    // Capture scroll from nested panes / footnote cards.
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as globalThis.Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closeMenu();
    }
    // Capture Escape first so a parent surface (e.g. footnote card) does not
    // also close — sequential inserts should stay available until Escape or
    // an outside click (including back into the editor text).
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const panel =
    open &&
    pos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Special characters"
        className="special-chars-panel fixed flex flex-col overflow-hidden rounded-lg border border-border bg-background p-3 shadow-lg"
        style={{
          top: pos.top,
          left: pos.left,
          width: Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PAD * 2),
          maxHeight: pos.maxHeight,
          zIndex: panelZ,
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="mb-2 shrink-0 text-[0.68rem] uppercase tracking-wider text-muted">
          Insert at cursor · accents apply to the previous letter
        </p>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1 pb-1">
          {GROUPS.map((group) => (
            <section key={group.heading}>
              <h3 className="mb-1.5 text-[0.68rem] font-medium uppercase tracking-wider text-muted">
                {group.heading}
              </h3>
              <div className="flex flex-wrap gap-1">
                {group.actions?.map((action) => (
                  <button
                    key={`${group.heading}-${action.label}`}
                    type="button"
                    title={action.title}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      action.run(editor);
                    }}
                    className={tileClass(action.wide)}
                  >
                    {action.label}
                  </button>
                ))}
                {group.items.map((item) => (
                  <button
                    key={`${group.heading}-${item.label}`}
                    type="button"
                    title={item.title}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      insertIntoEditor(editor, item);
                    }}
                    className={tileClass(item.wide)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>,
      document.body
    );

  return (
    <div ref={rootRef} className="special-chars relative">
      <button
        ref={buttonRef}
        type="button"
        title="Special characters, dashes, accents, LaTeX"
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.95rem] leading-none text-muted hover:bg-panel hover:text-foreground ${
          open ? "bg-accent/15 text-accent" : ""
        }`}
      >
        Ω
      </button>
      {panel}
    </div>
  );
}
