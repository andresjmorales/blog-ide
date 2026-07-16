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

export function DeletedFootnotesPanel() {
  const { deletedFootnotes, restoreDeletedFootnote, dismissDeletedFootnote } =
    useDocumentSession();
  const [open, setOpen] = useState(true);

  if (deletedFootnotes.length === 0) return null;

  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-xs font-mono uppercase tracking-wider text-muted hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Deleted footnotes</span>
        <span className="normal-case tracking-normal">
          {deletedFootnotes.length}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {deletedFootnotes.map((entry) => (
            <li
              key={`${entry.id}-${entry.deletedAt}`}
              className="rounded border border-border bg-background/70 px-2 py-1.5 text-xs"
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
