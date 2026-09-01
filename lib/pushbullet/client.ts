import type {
  PushbulletDevice,
  PushbulletPush,
  PushbulletUser,
} from "@/lib/pushbullet/types";

export const PUSHBULLET_API = "https://api.pushbullet.com/v2";
export const PUSHBULLET_STREAM = "wss://stream.pushbullet.com/websocket";
/** Account page where Pushbullet issues access tokens. */
export const PUSHBULLET_TOKEN_URL =
  "https://www.pushbullet.com/#settings/account";
/** Browser REST calls go here so ad blockers never see api.pushbullet.com. */
export const PUSHBULLET_PROXY = "/api/pb";

export function pushbulletRestUrl(path: string): string {
  const root =
    typeof window !== "undefined" ? PUSHBULLET_PROXY : PUSHBULLET_API;
  return `${root}${path}`;
}

export class PushbulletApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PushbulletApiError";
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string };
      error_message?: string;
    };
    return (
      body.error?.message ||
      body.error_message ||
      `Pushbullet request failed (${res.status})`
    );
  } catch {
    return `Pushbullet request failed (${res.status})`;
  }
}

export async function pushbulletFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Access-Token", token);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(pushbulletRestUrl(path), {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new PushbulletApiError(await parseError(res), res.status);
  }
  if (res.status === 204) return {} as T;
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function pushbulletWhoAmI(token: string): Promise<PushbulletUser> {
  return pushbulletFetch<PushbulletUser>(token, "/users/me");
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

export async function listPushbulletDevices(
  token: string
): Promise<PushbulletDevice[]> {
  const devices: PushbulletDevice[] = [];
  let cursor: string | undefined;
  do {
    const page = await pushbulletFetch<{
      devices?: PushbulletDevice[];
      cursor?: string;
    }>(token, `/devices${query({ active: true, cursor })}`);
    devices.push(...(page.devices ?? []));
    cursor = page.cursor;
  } while (cursor);
  return devices;
}

export async function createPushbulletDevice(
  token: string,
  input: {
    nickname: string;
    fingerprint: string;
  }
): Promise<PushbulletDevice> {
  return pushbulletFetch<PushbulletDevice>(token, "/devices", {
    method: "POST",
    body: JSON.stringify({
      nickname: input.nickname,
      fingerprint: input.fingerprint,
      manufacturer: "BlogIDE",
      model: "Notes channel",
      icon: "system",
    }),
  });
}

export async function updatePushbulletDevice(
  token: string,
  iden: string,
  patch: { nickname: string }
): Promise<PushbulletDevice> {
  return pushbulletFetch<PushbulletDevice>(
    token,
    `/devices/${encodeURIComponent(iden)}`,
    {
      method: "POST",
      body: JSON.stringify(patch),
    }
  );
}

export async function listPushbulletPushes(
  token: string,
  input: { modifiedAfter?: number | null; limit?: number } = {}
): Promise<PushbulletPush[]> {
  const pushes: PushbulletPush[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await pushbulletFetch<{
      pushes?: PushbulletPush[];
      cursor?: string;
    }>(
      token,
      `/pushes${query({
        active: true,
        modified_after:
          input.modifiedAfter != null ? input.modifiedAfter : undefined,
        limit: input.limit ?? 500,
        cursor,
      })}`
    );
    pushes.push(...(page.pushes ?? []));
    cursor = page.cursor;
    pages += 1;
  } while (cursor && pages < 3);
  return pushes;
}

export function pushbulletStreamUrl(token: string): string {
  return `${PUSHBULLET_STREAM}/${encodeURIComponent(token)}`;
}
