import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

function isPrivateIp(ip: string): boolean {
  if (ip === "0.0.0.0" || ip === "::" || ip === "::1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  // IPv6 unique local / link-local
  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) {
    return true;
  }
  return false;
}

export type SafeUrl = {
  href: string;
  hostname: string;
};

/**
 * Validate a user-supplied URL for server-side fetch (SSRF hardening).
 * Resolves DNS and rejects private/link-local targets.
 */
export async function assertSafePublicUrl(raw: string): Promise<SafeUrl> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".local")) {
    throw new Error("Host not allowed");
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private IP not allowed");
  } else {
    const records = await lookup(hostname, { all: true });
    if (!records.length) throw new Error("Could not resolve host");
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new Error("Host resolves to a private address");
      }
    }
  }

  return { href: parsed.href, hostname };
}
