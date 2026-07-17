"use client";

import { useState } from "react";
import { useDocumentSession } from "@/components/DocumentSessionContext";

function previewText(markdown: string): string {
  const plain = markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`>#-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "Empty footnote";
  return plain.length > 72 ? `${plain.slice(0, 72)}…` : plain;
}

export function DeletedFootnotesPanel({
  variant = "rail",
  defaultOpen = false,
}: {
  /** Rail sits at the bottom of the sidenote column; inline is a fallback. */
  variant?: "rail" | "inline";
  defaultOpen?: boolean;
}) {
  const { deletedFootnotes, restoreDeletedFootnote, dismissDeletedFootnote } =
    useDocumentSession();
  const [open, setOpen] = useState(defaultOpen);

  if (deletedFootnotes.length === 0) return null;

  const rootClass =
    variant === "rail"
      ? "sidenote-rail-deleted"
      : "mt-4 border-t border-border pt-3";

  return (
    <div className={rootClass}>
      <button
        type="button"
        className={
          variant === "rail"
            ? "sidenote-rail-deleted-toggle"
            : "flex w-full items-center justify-between text-left text-xs font-mono uppercase tracking-wider text-muted hover:text-foreground"
        }
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Deleted footnotes</span>
        <span className="normal-case tracking-normal tabular-nums">
          {deletedFootnotes.length}
        </span>
      </button>
      {open && (
        <ul
          className={
            variant === "rail"
              ? "sidenote-rail-deleted-list"
              : "mt-2 space-y-2"
          }
        >
          {deletedFootnotes.map((entry) => (
            <li
              key={`${entry.id}-${entry.deletedAt}`}
              className={
                variant === "rail"
                  ? "sidenote-rail-deleted-item"
                  : "rounded border border-border bg-background/70 px-2 py-1.5 text-xs"
              }
            >
              <p className="leading-snug text-foreground">
                {previewText(entry.content)}
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] hover:border-accent hover:text-accent"
                  onClick={() => restoreDeletedFootnote(entry.id)}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-muted hover:text-foreground"
                  onClick={() => dismissDeletedFootnote(entry.id)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
