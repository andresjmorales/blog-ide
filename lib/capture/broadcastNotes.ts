import type { CaptureNote } from "@/lib/capture/format";

export type ChannelCaptureNote = CaptureNote & {
  channelId: string;
  channelName: string;
  /** Set when the same stamp+text was written to more than one channel. */
  channelIds?: string[];
};

function noteIdentity(note: Pick<CaptureNote, "at" | "text">): string {
  return `${note.at}\0${note.text}`;
}

/**
 * Notes sent to "All channels" are stored once per channel file. The All
 * view should show that as one row, not one copy per channel.
 */
export function collapseBroadcastNotes(
  notes: ChannelCaptureNote[],
  channelCount: number
): ChannelCaptureNote[] {
  const groups = new Map<string, ChannelCaptureNote[]>();
  for (const note of notes) {
    const key = noteIdentity(note);
    const list = groups.get(key);
    if (list) list.push(note);
    else groups.set(key, [note]);
  }

  const seen = new Set<string>();
  const collapsed: ChannelCaptureNote[] = [];
  for (const note of notes) {
    const key = noteIdentity(note);
    if (seen.has(key)) continue;
    seen.add(key);
    const group = groups.get(key) ?? [note];
    const byChannel = new Map<string, ChannelCaptureNote>();
    for (const row of group) {
      if (!byChannel.has(row.channelId)) byChannel.set(row.channelId, row);
    }
    const channelIds = [...byChannel.keys()];
    if (channelIds.length <= 1) {
      collapsed.push(note);
      continue;
    }
    const names = [...byChannel.values()].map((row) => row.channelName);
    const channelName =
      channelCount > 1 && channelIds.length === channelCount
        ? "all"
        : names.join(", ");
    collapsed.push({
      ...note,
      channelName,
      channelIds,
    });
  }
  return collapsed;
}

/** Unread badge: a broadcast to every channel counts as one note. */
export function countUniqueUnreadNotes(
  notes: Array<Pick<CaptureNote, "at" | "text" | "atMs">>,
  seenAt: number
): number {
  const keys = new Set<string>();
  for (const note of notes) {
    if (note.atMs > seenAt) keys.add(noteIdentity(note));
  }
  return keys.size;
}
