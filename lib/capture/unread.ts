import { countUniqueUnreadNotes } from "@/lib/capture/broadcastNotes";
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
  const notes: ReturnType<typeof parseCaptureNotes> = [];
  for (const channel of channels) {
    try {
      const opened = await openDocument(channel.id);
      notes.push(...parseCaptureNotes(opened.markdown));
    } catch {
      /* skip missing channel */
    }
  }
  return countUniqueUnreadNotes(notes, seenAt);
}
