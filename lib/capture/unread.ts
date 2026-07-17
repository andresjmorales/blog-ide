import { parseCaptureNotes } from "@/lib/capture/format";
import { loadShellSeenAtMs } from "@/lib/capture/seen";
import { openDocument } from "@/lib/sync/engine";
import { listInboxChannels } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";

/** Count capture notes newer than the last time Shell was viewed. */
export async function countUnreadCaptureNotes(
  nodes: WorkspaceNode[]
): Promise<number> {
  const seenAt = loadShellSeenAtMs();
  const channels = listInboxChannels(nodes);
  let count = 0;
  for (const channel of channels) {
    try {
      const opened = await openDocument(channel.id);
      for (const note of parseCaptureNotes(opened.markdown)) {
        if (note.atMs > seenAt) count += 1;
      }
    } catch {
      /* skip missing channel */
    }
  }
  return count;
}
