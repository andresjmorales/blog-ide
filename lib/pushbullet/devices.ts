import type {
  ChannelDeviceTarget,
  DeviceSyncPlan,
  PushbulletDevice,
} from "@/lib/pushbullet/types";

export const DEVICE_NICKNAME_PREFIX = "BlogIDE · ";
const MAX_NICKNAME = 64;

export function deviceFingerprint(channelNodeId: string): string {
  return `blogide:channel:${channelNodeId}`;
}

export function deviceNickname(channelName: string): string {
  const name = channelName.trim() || "notes";
  const prefix = DEVICE_NICKNAME_PREFIX;
  const rest = name.slice(0, Math.max(1, MAX_NICKNAME - prefix.length));
  return `${prefix}${rest}`;
}

export function isBlogideDevice(device: PushbulletDevice): boolean {
  if (device.fingerprint?.startsWith("blogide:channel:")) return true;
  return Boolean(device.nickname?.startsWith(DEVICE_NICKNAME_PREFIX));
}

function channelTarget(
  channel: { id: string; name: string }
): ChannelDeviceTarget {
  return {
    channelId: channel.id,
    channelName: channel.name,
    fingerprint: deviceFingerprint(channel.id),
    nickname: deviceNickname(channel.name),
  };
}

/**
 * Match each Notes channel to a Pushbullet device (fingerprint first,
 * then nickname). Create/rename as needed; never delete leftover devices.
 */
export function planDeviceSync(input: {
  channels: Array<{ id: string; name: string }>;
  devices: PushbulletDevice[];
}): DeviceSyncPlan {
  const active = input.devices.filter((d) => d.active !== false && d.iden);
  const used = new Set<string>();
  const create: ChannelDeviceTarget[] = [];
  const rename: Array<{ iden: string; nickname: string }> = [];
  const map: DeviceSyncPlan["map"] = [];

  for (const channel of input.channels) {
    const target = channelTarget(channel);
    const byFingerprint = active.find(
      (d) => d.fingerprint === target.fingerprint && !used.has(d.iden)
    );
    const byNickname = active.find(
      (d) => d.nickname === target.nickname && !used.has(d.iden)
    );
    const device = byFingerprint ?? byNickname;
    if (!device) {
      create.push(target);
      continue;
    }
    used.add(device.iden);
    if (device.nickname !== target.nickname) {
      rename.push({ iden: device.iden, nickname: target.nickname });
    }
    map.push({
      channelId: channel.id,
      channelName: channel.name,
      deviceIden: device.iden,
      nickname: target.nickname,
    });
  }

  return { create, rename, map };
}
