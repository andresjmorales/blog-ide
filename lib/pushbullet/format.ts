import { formatCaptureStamp, parseCaptureNotes } from "@/lib/capture/format";
import type { PushbulletPush } from "@/lib/pushbullet/types";

function joinTitleBody(title?: string, body?: string): string {
  const heading = title?.trim() ?? "";
  const rest = body?.trim() ?? "";
  if (heading && rest) return `${heading}: ${rest}`;
  return heading || rest;
}

function markdownLink(label: string, href: string | undefined): string {
  const safe = label.replace(/\]/g, "\\]");
  const url = href?.trim();
  return url ? `[${safe}](${url})` : safe;
}

/**
 * Turn a Pushbullet note/link/file into a Shell capture line.
 * Returns null when there is nothing worth storing.
 */
export function formatPushAsCapture(push: PushbulletPush): string | null {
  if (push.active === false) return null;
  const type = push.type ?? "note";
  if (type === "link") {
    const url = push.url?.trim();
    const label = push.title?.trim() || url || "link";
    const text = joinTitleBody(markdownLink(label, url), push.body);
    return text || null;
  }
  if (type === "file") {
    const name = push.file_name?.trim() || push.title?.trim() || "file";
    const text = joinTitleBody(markdownLink(name, push.file_url), push.body);
    return text || null;
  }
  const text = joinTitleBody(push.title, push.body);
  return text || null;
}

export function pushCreatedAt(push: PushbulletPush, fallback: Date = new Date()): Date {
  if (typeof push.created === "number" && Number.isFinite(push.created)) {
    return new Date(push.created * 1000);
  }
  return fallback;
}

export function captureAlreadyPresent(
  markdown: string,
  text: string,
  at: Date
): boolean {
  const stamp = formatCaptureStamp(at);
  return parseCaptureNotes(markdown).some(
    (note) => note.at === stamp && note.text === text
  );
}
