"use client";

import { useEffect, useId, useRef, useState } from "react";

export type ShellSelectOption = { value: string; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: ShellSelectOption[];
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  className?: string;
  /** Composer row sits on the panel bottom; open upward so the menu stays visible. */
  placement?: "up" | "down";
};

/**
 * Compact listbox for the Notes pane. Native select option menus ignore
 * CSS on many browsers and fall back to a serif face that the rest of BlogIDE
 * never uses.
 */
export function ShellSelect({
  value,
  onChange,
  options,
  disabled = false,
  title,
  "aria-label": ariaLabel,
  className = "",
  placement = "down",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  return (
    <div className={`relative min-w-0 ${className}`} ref={rootRef}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full min-w-0 items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 font-sans text-[0.75rem] leading-snug text-foreground outline-none hover:border-accent/60 focus:border-accent disabled:opacity-40"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.label ?? ""}
        </span>
        <SelectCaret open={open} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute left-0 z-50 max-h-48 min-w-full w-max overflow-y-auto rounded-md border border-border bg-background py-0.5 font-sans text-[0.75rem] shadow-md ${
            placement === "up" ? "bottom-full mb-0.5" : "top-full mt-0.5"
          }`}
        >
          {options.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`flex w-full min-w-max items-center whitespace-nowrap px-2.5 py-1 text-left font-sans hover:bg-panel ${
                  opt.value === value ? "text-accent" : "text-foreground"
                }`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectCaret({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      data-select-caret=""
      className={`shrink-0 text-muted ${open ? "rotate-180" : ""}`}
      width="8"
      height="6"
      viewBox="0 0 8 6"
      fill="currentColor"
    >
      <path d="M0.8 1.1h6.4L4 5.2 0.8 1.1z" />
    </svg>
  );
}
