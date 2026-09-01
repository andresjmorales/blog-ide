import { appendCaptureBulletToMarkdown } from "@/lib/capture/format";
import { notifyNotesChanged } from "@/lib/capture/seen";
import { openDocument, saveLocal, syncDocument } from "@/lib/sync/engine";
import { pollNtfyMessages } from "@/lib/ntfy/client";
import {
  loadNtfyCursor,
  markNtfyIngested,
  saveNtfyCursor,
} from "@/lib/ntfy/cursor";
import {
  formatNtfyAsCapture,
  ntfyAlreadyPresent,
  ntfyCreatedAt,
  selectNtfyToIngest,
} from "@/lib/ntfy/format";
import { loadNtfySecrets } from "@/lib/ntfy/settings";

export async function ingestNtfyMessages(): Promise<{
  ingested: number;
  initialized: boolean;
}> {
  const secrets = loadNtfySecrets();
  if (!secrets || secrets.topics.length === 0) {
    return { ingested: 0, initialized: false };
  }
  const cursor = loadNtfyCursor();
  const topicToChannel = new Map(
    secrets.topics.map((row) => [row.topic, row.channelId])
  );

  if (cursor.since == null) {
    const recent = await pollNtfyMessages({ secrets, since: "latest" });
    const newest = recent.reduce((max, msg) => {
      const t = msg.time ?? 0;
      return t > max ? t : max;
    }, 0);
    saveNtfyCursor({ since: newest || 0, ingested: [] });
    return { ingested: 0, initialized: true };
  }

  const messages = await pollNtfyMessages({ secrets, since: cursor.since });
  const candidates = selectNtfyToIngest({
    messages,
    topicToChannel,
    ingestedIds: new Set(cursor.ingested),
  });

  const ingested: string[] = [];
  let appended = 0;
  let failed = false;
  for (const { message, channelNodeId } of candidates) {
    const text = formatNtfyAsCapture(message);
    if (!text) {
      ingested.push(message.id);
      continue;
    }
    const at = ntfyCreatedAt(message);
    try {
      const opened = await openDocument(channelNodeId);
      if (ntfyAlreadyPresent(opened.markdown, text, at)) {
        ingested.push(message.id);
        continue;
      }
      const next = appendCaptureBulletToMarkdown(opened.markdown, text, at);
      await saveLocal(channelNodeId, next, opened.baseVersion);
      await syncDocument(channelNodeId);
      ingested.push(message.id);
      appended += 1;
    } catch {
      failed = true;
    }
  }

  const newest = messages.reduce((max, msg) => {
    const t = msg.time ?? 0;
    return t > max ? t : max;
  }, cursor.since ?? 0);

  saveNtfyCursor(
    markNtfyIngested(
      cursor,
      ingested,
      failed ? cursor.since : newest
    )
  );
  if (appended > 0) notifyNotesChanged();
  return { ingested: appended, initialized: false };
}
