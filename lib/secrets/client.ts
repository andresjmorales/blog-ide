import type { AccountSecrets, NtfySecrets } from "@/lib/secrets/types";
import {
  applyPushbulletToken,
  loadPushbulletToken,
  PUSHBULLET_TOKEN_EVENT,
} from "@/lib/pushbullet/token";
import {
  applyNtfySecrets,
  loadNtfySecrets,
  NTFY_SECRETS_EVENT,
} from "@/lib/ntfy/settings";

export const SECRETS_EVENT = "blogide-account-secrets";

async function fetchSecrets(): Promise<AccountSecrets | null> {
  try {
    const res = await fetch("/api/secrets", { credentials: "same-origin" });
    if (res.status === 401 || res.status === 503) return null;
    if (!res.ok) return null;
    return (await res.json()) as AccountSecrets;
  } catch {
    return null;
  }
}

export async function persistAccountSecrets(
  patch: AccountSecrets
): Promise<AccountSecrets | null> {
  try {
    const res = await fetch("/api/secrets", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const next = (await res.json()) as AccountSecrets;
    window.dispatchEvent(new Event(SECRETS_EVENT));
    return next;
  } catch {
    return null;
  }
}

/**
 * Load encrypted account secrets into memory. Migrates a leftover
 * device-local Pushbullet token into the account vault once.
 */
export async function hydrateAccountSecrets(): Promise<void> {
  const localPb = loadPushbulletToken();
  const localNtfy = loadNtfySecrets();
  const cloud = await fetchSecrets();
  if (cloud) {
    if (cloud.pushbullet) {
      applyPushbulletToken(cloud.pushbullet, { persistLocal: true });
    } else if (localPb) {
      await persistAccountSecrets({ pushbullet: localPb });
    }
    if (cloud.ntfy) {
      applyNtfySecrets(cloud.ntfy, { persistLocal: true });
    } else if (localNtfy) {
      await persistAccountSecrets({ ntfy: localNtfy });
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PUSHBULLET_TOKEN_EVENT));
    window.dispatchEvent(new Event(NTFY_SECRETS_EVENT));
    window.dispatchEvent(new Event(SECRETS_EVENT));
  }
}

export async function savePushbulletTokenRemote(token: string): Promise<boolean> {
  const next = await persistAccountSecrets({ pushbullet: token });
  return next != null;
}

export async function saveNtfySecretsRemote(
  ntfy: NtfySecrets | null
): Promise<boolean> {
  const next = await persistAccountSecrets({
    ntfy: ntfy ?? { server: "", topics: [] },
  });
  return next != null;
}
