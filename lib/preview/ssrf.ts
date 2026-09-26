import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

/**
 * Non-public ranges a server-side fetch must never reach. BlockList also
 * matches IPv4-mapped IPv6 (`::ffff:127.0.0.1`) against the IPv4 rules.
 */
const PRIVATE_RANGES = (() => {
  const list = new BlockList();
  const v4: [string, number][] = [
    ["0.0.0.0", 8], // "this network"
    ["10.0.0.0", 8],
    ["100.64.0.0", 10], // carrier-grade NAT
    ["127.0.0.0", 8],
    ["169.254.0.0", 16], // link-local incl. cloud metadata
    ["172.16.0.0", 12],
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // TEST-NET-1
    ["192.168.0.0", 16],
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved + broadcast
  ];
  for (const [net, prefix] of v4) list.addSubnet(net, prefix, "ipv4");
  const v6: [string, number][] = [
    ["::", 128], // unspecified
    ["::1", 128], // loopback
    ["64:ff9b::", 96], // NAT64 (embeds IPv4)
    ["100::", 64], // discard
    ["2001:db8::", 32], // documentation
    ["fc00::", 7], // unique local
    ["fe80::", 10], // link-local
    ["ff00::", 8], // multicast
  ];
  for (const [net, prefix] of v6) list.addSubnet(net, prefix, "ipv6");
  return list;
})();

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return PRIVATE_RANGES.check(ip, "ipv4");
  if (family === 6) return PRIVATE_RANGES.check(ip, "ipv6");
  return true; // not an IP literal — refuse rather than guess
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
  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Host not allowed");
  }

  // URL keeps IPv6 literals bracketed ("[::1]").
  const literal = hostname.replace(/^\[(.*)\]$/, "$1");
  if (isIP(literal)) {
    if (isPrivateIp(literal)) throw new Error("Private IP not allowed");
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

const MAX_REDIRECTS = 5;

/**
 * fetch() that validates every hop. `redirect: "follow"` would already have
 * sent the request to a private address before the final URL could be
 * checked, so redirects are followed by hand. The returned Response's `url`
 * is the final hop.
 */
export async function safePublicFetch(
  raw: string,
  init: Omit<RequestInit, "redirect"> = {}
): Promise<Response> {
  let current = raw;
  let method = init.method ?? "GET";
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const safe = await assertSafePublicUrl(current);
    const response = await fetch(safe.href, {
      ...init,
      method,
      redirect: "manual",
    });
    const location =
      response.status >= 300 && response.status < 400
        ? response.headers.get("location")
        : null;
    if (!location) return response;
    response.body?.cancel().catch(() => {});
    current = new URL(location, safe.href).href;
    // Browsers downgrade POST to GET on 301/302/303; HEAD stays HEAD.
    if (response.status === 303 && method !== "HEAD") method = "GET";
  }
  throw new Error("Too many redirects");
}

/**
 * Read at most `maxBytes` of a response body, cancelling the rest so a huge
 * (or endless) body can't exhaust server memory.
 */
export async function readBodyCapped(
  response: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const take = Math.min(value.byteLength, maxBytes - total);
    chunks.push(take === value.byteLength ? value : value.subarray(0, take));
    total += take;
  }
  reader.cancel().catch(() => {});
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
