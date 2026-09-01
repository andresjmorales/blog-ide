import { appendCaptureBulletToMarkdown } from "@/lib/capture/format";
import { notifyNotesChanged } from "@/lib/capture/seen";
import { openDocument, saveLocal, syncDocument } from "@/lib/sync/engine";
import {
  loadPushbulletCursor,
  markIngested,
  savePushbulletCursor,
} from "@/lib/pushbullet/cursor";
import {
  createPushbulletDevice,
  listPushbulletDevices,
  listPushbulletPushes,
  updatePushbulletDevice,
} from "@/lib/pushbullet/client";
import { planDeviceSync } from "@/lib/pushbullet/devices";
import {
  captureAlreadyPresent,
  formatPushAsCapture,
  pushCreatedAt,
} from "@/lib/pushbullet/format";
import { newestModified, selectPushesToIngest } from "@/lib/pushbullet/ingest";
import { savePushbulletStatus } from "@/lib/pushbullet/status";
import type { DeviceSyncPlan } from "@/lib/pushbullet/types";

export async function syncPushbulletDevices(
  token: string,
  channels: Array<{ id: string; name: string }>
): Promise<DeviceSyncPlan> {
  const devices = await listPushbulletDevices(token);
  const plan = planDeviceSync({ channels, devices });
  const map = [...plan.map];

  for (const target of plan.create) {
    const created = await createPushbulletDevice(token, {
      nickname: target.nickname,
      fingerprint: target.fingerprint,
    });
    if (created.iden) {
      map.push({
        channelId: target.channelId,
        channelName: target.channelName,
        deviceIden: created.iden,
        nickname: target.nickname,
      });
    }
  }

  for (const row of plan.rename) {
    await updatePushbulletDevice(token, row.iden, { nickname: row.nickname });
  }

  savePushbulletStatus({
    deviceCount: map.length,
    lastError: null,
  });

  return { ...plan, map };
}

/**
 * Fetch new targeted pushes and append them to the matching Notes channel.
 * The first run only records a cursor so years of Pushbullet history are not
 * dumped into Notes.
 */
export async function ingestPushbulletPushes(input: {
  token: string;
  channels: Array<{ id: string; name: string }>;
}): Promise<{ ingested: number; initialized: boolean }> {
  const cursor = loadPushbulletCursor();
  const devices = await syncPushbulletDevices(input.token, input.channels);
  const deviceToChannel = new Map(
    devices.map.map((row) => [row.deviceIden, row.channelId])
  );

  if (cursor.modifiedAfter == null) {
    const recent = await listPushbulletPushes(input.token, { limit: 1 });
    const newest = newestModified(recent) ?? 0;
    savePushbulletCursor({ modifiedAfter: newest, ingested: [] });
    savePushbulletStatus({
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    });
    return { ingested: 0, initialized: true };
  }

  const pushes = await listPushbulletPushes(input.token, {
    modifiedAfter: cursor.modifiedAfter,
  });
  const candidates = selectPushesToIngest({
    pushes,
    deviceToChannel,
    ingestedIdens: new Set(cursor.ingested),
  });

  const ingested: string[] = [];
  let appended = 0;
  let failed = false;
  for (const { push, channelNodeId } of candidates) {
    const text = formatPushAsCapture(push);
    if (!text) {
      ingested.push(push.iden);
      continue;
    }
    const at = pushCreatedAt(push);
    try {
      const opened = await openDocument(channelNodeId);
      if (captureAlreadyPresent(opened.markdown, text, at)) {
        ingested.push(push.iden);
        continue;
      }
      const next = appendCaptureBulletToMarkdown(opened.markdown, text, at);
      await saveLocal(channelNodeId, next, opened.baseVersion);
      await syncDocument(channelNodeId);
      ingested.push(push.iden);
      appended += 1;
    } catch {
      failed = true;
    }
  }

  const newest = newestModified(pushes);
  savePushbulletCursor(
    markIngested(
      cursor,
      ingested,
      failed ? cursor.modifiedAfter : (newest ?? cursor.modifiedAfter)
    )
  );
  savePushbulletStatus({
    lastSyncAt: new Date().toISOString(),
    lastError: null,
    deviceCount: devices.map.length,
  });
  if (appended > 0) notifyNotesChanged();
  return { ingested: appended, initialized: false };
}
