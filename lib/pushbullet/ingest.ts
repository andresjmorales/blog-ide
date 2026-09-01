import type { PushbulletPush } from "@/lib/pushbullet/types";

export type IngestCandidate = {
  push: PushbulletPush;
  channelNodeId: string;
};

/**
 * Pushes targeted at a BlogIDE virtual device, oldest first.
 * Broadcasts (no target_device_iden) are left alone so the existing
 * Pushbullet "all devices" workflow is unchanged.
 */
export function selectPushesToIngest(input: {
  pushes: PushbulletPush[];
  deviceToChannel: Map<string, string>;
  ingestedIdens: Set<string>;
}): IngestCandidate[] {
  const selected: IngestCandidate[] = [];
  for (const push of input.pushes) {
    if (!push.iden || push.active === false) continue;
    if (input.ingestedIdens.has(push.iden)) continue;
    const target = push.target_device_iden;
    if (!target) continue;
    const channelNodeId = input.deviceToChannel.get(target);
    if (!channelNodeId) continue;
    selected.push({ push, channelNodeId });
  }
  return selected.sort((a, b) => {
    const ac = a.push.created ?? a.push.modified ?? 0;
    const bc = b.push.created ?? b.push.modified ?? 0;
    return ac - bc;
  });
}

export function newestModified(pushes: PushbulletPush[]): number | null {
  let max: number | null = null;
  for (const push of pushes) {
    if (typeof push.modified !== "number" || !Number.isFinite(push.modified)) {
      continue;
    }
    if (max == null || push.modified > max) max = push.modified;
  }
  return max;
}
