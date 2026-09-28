import type { WordSegment } from "@/lib/markdown/wordDiff";

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
