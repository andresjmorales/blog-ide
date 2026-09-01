import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AccountSecrets } from "@/lib/secrets/types";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

export function deriveSecretsKey(material: string): Buffer {
  return createHash("sha256").update(material, "utf8").digest();
}

export function encryptSecretPayload(
  payload: AccountSecrets,
  material: string
): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, deriveSecretsKey(material), iv);
  const plain = Buffer.from(JSON.stringify(payload), "utf8");
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString("base64");
}

export function decryptSecretPayload(
  blob: string,
  material: string
): AccountSecrets {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Secret blob is truncated.");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const body = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, deriveSecretsKey(material), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  const parsed = JSON.parse(plain.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as AccountSecrets;
}

export function mergeSecrets(
  current: AccountSecrets,
  patch: AccountSecrets
): AccountSecrets {
  const next: AccountSecrets = { ...current };
  if ("pushbullet" in patch) {
    const value = patch.pushbullet?.trim() ?? "";
    if (value) next.pushbullet = value;
    else delete next.pushbullet;
  }
  if ("ntfy" in patch) {
    const ntfy = patch.ntfy;
    if (
      !ntfy ||
      (!ntfy.server.trim() && ntfy.topics.length === 0 && !ntfy.token)
    ) {
      delete next.ntfy;
    } else {
      next.ntfy = {
        server: ntfy.server.trim() || "https://ntfy.sh",
        token: ntfy.token?.trim() || undefined,
        topics: ntfy.topics.filter((row) => row.topic.trim()),
      };
      if (!next.ntfy.token) delete next.ntfy.token;
    }
  }
  return next;
}
