export type PushbulletUser = {
  iden: string;
  email?: string;
  name?: string;
};

export type PushbulletDevice = {
  iden: string;
  active?: boolean;
  nickname?: string;
  fingerprint?: string;
  manufacturer?: string;
  model?: string;
  icon?: string;
};

export type PushbulletPush = {
  iden: string;
  active?: boolean;
  created?: number;
  modified?: number;
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  file_name?: string;
  file_url?: string;
  target_device_iden?: string;
  channel_iden?: string;
};

export type PushbulletCursor = {
  /** Unix seconds from the latest Pushbullet `modified` we have applied. */
  modifiedAfter: number | null;
  ingested: string[];
};

export type ChannelDeviceTarget = {
  channelId: string;
  channelName: string;
  fingerprint: string;
  nickname: string;
};

export type DeviceSyncPlan = {
  create: ChannelDeviceTarget[];
  rename: Array<{ iden: string; nickname: string }>;
  map: Array<{
    channelId: string;
    channelName: string;
    deviceIden: string;
    nickname: string;
  }>;
};

export type PushbulletRuntimeStatus = {
  email?: string;
  lastSyncAt?: string;
  lastError?: string | null;
  deviceCount?: number;
};
