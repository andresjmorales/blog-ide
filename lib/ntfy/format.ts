import { formatCaptureStamp, parseCaptureNotes } from "@/lib/capture/format";
import type { NtfyMessage } from "@/lib/ntfy/client";

function joinTitleBody(title?: string, body?: string): string {
  const heading = title?.trim() ?? "";
  const rest = body?.trim() ?? "";
  if (heading && rest) return `${heading}: ${rest}`;
  return heading || rest;
}

export function formatNtfyAsCapture(message: NtfyMessage): string | null {
  if (message.event && message.event !== "message") return null;
  const parts: string[] = [];
  const body = joinTitleBody(message.title, message.message);
  if (body) parts.push(body);
  if (message.click?.trim()) {
    parts.push(`[link](${message.click.trim()})`);
  }
  const file = message.attachment;
  if (file?.url) {
    const name = (file.name || "file").replace(/\]/g, "\\]");
    parts.push(`[${name}](${file.url})`);
  }
  const text = parts.join(" ").trim();
  return text || null;
}

export function ntfyCreatedAt(message: NtfyMessage, fallback = new Date()): Date {
  if (typeof message.time === "number" && Number.isFinite(message.time)) {
    return new Date(message.time * 1000);
  }
  return fallback;
}

export function ntfyAlreadyPresent(
  markdown: string,
  text: string,
  at: Date
): boolean {
  const stamp = formatCaptureStamp(at);
  return parseCaptureNotes(markdown).some(
    (note) => note.at === stamp && note.text === text
  );
}

export function selectNtfyToIngest(input: {
  messages: NtfyMessage[];
  topicToChannel: Map<string, string>;
  ingestedIds: Set<string>;
}): Array<{ message: NtfyMessage; channelNodeId: string }> {
  const selected: Array<{ message: NtfyMessage; channelNodeId: string }> = [];
  for (const message of input.messages) {
    if (message.event && message.event !== "message") continue;
    if (!message.id || input.ingestedIds.has(message.id)) continue;
    const topic = message.topic?.trim();
    if (!topic) continue;
    const channelNodeId = input.topicToChannel.get(topic);
    if (!channelNodeId) continue;
    selected.push({ message, channelNodeId });
  }
  return selected.sort((a, b) => (a.message.time ?? 0) - (b.message.time ?? 0));
}
