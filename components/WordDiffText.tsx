"use client";

import { useState } from "react";
import { relabelSummary, type FootnoteRelabel } from "@/lib/markdown/diff";
import { wordDiff, type WordSegment } from "@/lib/markdown/wordDiff";

/** Inline word diff: removed text struck through in red, added in green. */
export function WordDiffText({ segments }: { segments: WordSegment[] }) {
  return (
    <div className="word-diff">
      {segments.map((segment, i) =>
        segment.type === "add" ? (
          <ins key={i}>{segment.text}</ins>
        ) : segment.type === "remove" ? (
          <del key={i}>{segment.text}</del>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </div>
  );
}

/**
 * A paragraph whose only change is footnote numbering, folded to one line;
 * click to see the word diff. Still a real change, just not a textual one.
 */
export function FootnoteRenumberWordRow({
  before,
  after,
  labels,
}: {
  before: string;
  after: string;
  labels: FootnoteRelabel[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="word-diff-renumber">
      <button
        type="button"
        className="word-diff-renumber-toggle"
        aria-expanded={open}
        title={open ? "Hide this paragraph" : "Show the paragraph"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "▾" : "▸"} Footnotes renumbered only ({relabelSummary(labels)})
        {open ? "" : `: ${after}`}
      </button>
      {open && <WordDiffText segments={wordDiff(before, after)} />}
    </div>
  );
}
