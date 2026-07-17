export type CaptureNote = {
  /** Local display timestamp from the bullet, e.g. 2026-07-17 12:30 */
  at: string;
  text: string;
  /** Milliseconds for sorting when parseable; 0 if not. */
  atMs: number;
};

const BULLET_RE = /^- \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (.+)$/;

/** Format a capture line for appending to a channel document. */
export function formatCaptureBullet(
  text: string,
  at: Date = new Date()
): string {
  const trimmed = text.trim();
  const stamp = formatCaptureStamp(at);
  return `- [${stamp}] ${trimmed}`;
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
  for (const line of markdown.split(/\r?\n/)) {
    const match = BULLET_RE.exec(line.trim());
    if (!match) continue;
    const at = match[1];
    const text = match[2];
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
  const target = `- [${note.at}] ${note.text}`;
  const lines = markdown.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === target);
  if (index === -1) return markdown;
  lines.splice(index, 1);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function captureNoteKey(
  channelId: string,
  note: Pick<CaptureNote, "at" | "text">
): string {
  return `${channelId}\0${note.at}\0${note.text}`;
}
