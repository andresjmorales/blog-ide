import { removeCaptureBulletFromMarkdown } from "@/lib/capture/format";
import { openDocument, saveLocal, syncDocument } from "@/lib/sync/engine";

/** Delete one capture bullet from a channel document and sync. */
export async function removeQuickNote(input: {
  channelNodeId: string;
  at: string;
  text: string;
}): Promise<void> {
  const opened = await openDocument(input.channelNodeId);
  const next = removeCaptureBulletFromMarkdown(opened.markdown, {
    at: input.at,
    text: input.text,
  });
  if (next === opened.markdown) {
    throw new Error("Note not found in channel.");
  }
  await saveLocal(input.channelNodeId, next, opened.baseVersion);
  await syncDocument(input.channelNodeId);
}
