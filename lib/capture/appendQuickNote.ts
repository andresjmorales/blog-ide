import { appendCaptureBulletToMarkdown } from "@/lib/capture/format";
import { openDocument, saveLocal, syncDocument } from "@/lib/sync/engine";

/**
 * Append a timestamped capture bullet to a Notes channel (or any document) and sync.
 */
export async function appendQuickNote(input: {
  channelNodeId: string;
  text: string;
  at?: Date;
}): Promise<void> {
  const trimmed = input.text.trim();
  if (!trimmed) throw new Error("Note is empty.");

  const opened = await openDocument(input.channelNodeId);
  const next = appendCaptureBulletToMarkdown(
    opened.markdown,
    trimmed,
    input.at ?? new Date()
  );
  await saveLocal(input.channelNodeId, next, opened.baseVersion);
  await syncDocument(input.channelNodeId);
}
