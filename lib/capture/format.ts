export type CaptureNote = {
  /** Local display timestamp from the bullet, e.g. 2026-07-17 12:30 */
  at: string;
  text: string;
  /** Milliseconds for sorting when parseable; 0 if not. */
  atMs: number;
};

const BULLET_RE = /^[-*] \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (.+)$/;

function isContinuationLine(line: string, nextLine?: string): boolean {
  const blank = line === "" || /^[ \t]*$/.test(line);
  if (blank) {
    return nextLine != null && /^[ \t]/.test(nextLine);
  }
  if (!/^[ \t]/.test(line)) return false;
  const normalized = unescapeMarkdown(line.trim());
  return !BULLET_RE.test(normalized);
}

function continuationBody(line: string): string {
  if (line === "" || /^[ \t]*$/.test(line)) return "";
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("  ")) return line.slice(2);
  return line.replace(/^[ \t]+/, "");
}

/**
 * Undo markdown character escapes. Opening a channel document in the editor
 * re-serializes bullets as `- \[2026-07-17 12:30\] …`, which used to make
 * the Shell parser skip every note ("channel looks empty").
 */
function unescapeMarkdown(line: string): string {
  return line.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, "$1");
}

/** Format a capture line for appending to a channel document. */
export function formatCaptureBullet(
  text: string,
  at: Date = new Date()
): string {
  const trimmed = text.trim();
  const stamp = formatCaptureStamp(at);
  const lines = trimmed.split(/\r?\n/);
  const head = `- [${stamp}] ${lines[0]}`;
  if (lines.length === 1) return head;
  const rest = lines.slice(1).map((line) => `  ${line}`);
  return [head, ...rest].join("\n");
}

export function formatCaptureStamp(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function parseCaptureNotes(markdown: string): CaptureNote[] {
  const notes: CaptureNote[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const match = BULLET_RE.exec(unescapeMarkdown(lines[i].trim()));
    if (!match) continue;
    const at = match[1];
    const parts = [match[2]];
    while (
      i + 1 < lines.length &&
      isContinuationLine(lines[i + 1], lines[i + 2])
    ) {
      i += 1;
      parts.push(continuationBody(lines[i]));
    }
    const text = parts.join("\n");
    notes.push({ at, text, atMs: captureStampToMs(at) });
  }
  return notes;
}

export function captureStampToMs(stamp: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(stamp);
  if (!match) return 0;
  const [, y, mo, d, hh, mm] = match;
  const ms = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm)
  ).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Append a capture bullet after frontmatter / existing body. */
export function appendCaptureBulletToMarkdown(
  markdown: string,
  text: string,
  at: Date = new Date()
): string {
  const bullet = formatCaptureBullet(text, at);
  const body = markdown.replace(/\s*$/, "");
  if (!body) return `${bullet}\n`;
  return `${body}\n${bullet}\n`;
}

/** Remove the first matching capture bullet (exact stamp + text). */
export function removeCaptureBulletFromMarkdown(
  markdown: string,
  note: Pick<CaptureNote, "at" | "text">
): string {
  // Notes come from parseCaptureNotes (unescaped), but the stored line may
  // carry editor round-trip escapes — compare both sides normalized, and
  // tolerate `*` bullets the same way the parser does.
  const firstLine = note.text.split(/\r?\n/)[0] ?? "";
  const target = `[${note.at}] ${firstLine}`;
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => {
    const normalized = unescapeMarkdown(line.trim());
    return (
      normalized === `- ${target}` || normalized === `* ${target}`
    );
  });
  if (index === -1) return markdown;
  let end = index + 1;
  while (
    end < lines.length &&
    isContinuationLine(lines[end], lines[end + 1])
  ) {
    end += 1;
  }
  lines.splice(index, end - index);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function captureNoteKey(
  channelId: string,
  note: Pick<CaptureNote, "at" | "text">
): string {
  return `${channelId}\0${note.at}\0${note.text}`;
}
