/**
 * Split view draws find highlights and measures line positions with a
 * transparent copy of the markdown textarea laid out behind it (same font,
 * padding, and wrapping). A textarea can't style ranges or report where a
 * soft-wrapped line lands; this mirror can.
 */

type MirrorMatch = { from: number; to: number };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Mirror markup: `<span data-l="i">` at the start of every non-blank line
 * (for scroll anchors) and `<mark>` around each find match. Matches must be
 * sorted and non-overlapping.
 */
export function buildSourceMirrorHtml(
  text: string,
  matches: readonly MirrorMatch[] = [],
  activeIndex = -1
): string {
  const out: string[] = [];
  const lines = text.split("\n");
  let matchIndex = 0;
  let offset = 0;
  lines.forEach((line, lineIndex) => {
    if (line.trim()) out.push(`<span data-l="${lineIndex}"></span>`);
    const end = offset + line.length;
    let pos = offset;
    while (pos < end) {
      while (
        matchIndex < matches.length &&
        matches[matchIndex]!.to <= pos
      ) {
        matchIndex += 1;
      }
      const match = matches[matchIndex];
      if (!match || match.from >= end) {
        out.push(escapeHtml(text.slice(pos, end)));
        break;
      }
      if (match.from > pos) {
        out.push(escapeHtml(text.slice(pos, match.from)));
        pos = match.from;
      }
      const segmentEnd = Math.min(match.to, end);
      const current = matchIndex === activeIndex ? " is-current" : "";
      out.push(
        `<mark class="blogide-find-match${current}" data-m="${matchIndex}">${escapeHtml(
          text.slice(pos, segmentEnd)
        )}</mark>`
      );
      pos = segmentEnd;
    }
    if (lineIndex < lines.length - 1) out.push("\n");
    offset = end + 1;
  });
  // A trailing newline still gets a line box in the textarea.
  out.push("​");
  return out.join("");
}
