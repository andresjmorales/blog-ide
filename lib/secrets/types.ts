export type NtfyTopicMap = {
  channelId: string;
  channelName: string;
  topic: string;
};

export type NtfySecrets = {
  /** Origin of the ntfy server, e.g. https://ntfy.sh */
  server: string;
  /** Optional access token for reserved / ACL-protected topics. */
  token?: string;
  topics: NtfyTopicMap[];
};

export type AccountSecrets = {
  pushbullet?: string;
  ntfy?: NtfySecrets;
};

export const EMPTY_SECRETS: AccountSecrets = {};
