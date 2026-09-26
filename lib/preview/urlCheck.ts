import { safePublicFetch } from "@/lib/preview/ssrf";

const TIMEOUT_MS = 5000;
const BROWSER_UA =
  "Mozilla/5.0 (compatible; BlogIDE-UrlCheck/1.1; +https://blogide.com)";

export type UrlCheckResult = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  /**
   * True when the host likely bot-blocks automated probes (403/401 after
   * GET fallback). UI should warn rather than treat as a hard dead link.
   */
  soft?: boolean;
};

const RETRY_STATUSES = new Set([401, 403, 405, 501]);

async function fetchProbe(
  href: string,
  method: "HEAD" | "GET",
  signal: AbortSignal
): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  };
  if (method === "GET") {
    headers.Range = "bytes=0-0";
  }
  // Every redirect hop is validated before it is requested.
  const response = await safePublicFetch(href, { method, signal, headers });
  response.body?.cancel().catch(() => {});
  return response;
}

export async function probeUrl(raw: string): Promise<UrlCheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let response = await fetchProbe(raw, "HEAD", controller.signal);
      if (RETRY_STATUSES.has(response.status)) {
        response = await fetchProbe(raw, "GET", controller.signal);
      }
      const status = response.status;
      if (status >= 200 && status < 400) {
        return { url: raw, ok: true, status };
      }
      if (status === 401 || status === 403) {
        return {
          url: raw,
          ok: false,
          status,
          soft: true,
          error: `HTTP ${status} (may be bot-blocked; open in a browser to verify)`,
        };
      }
      return {
        url: raw,
        ok: false,
        status,
        error: `HTTP ${status}`,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      url: raw,
      ok: false,
      error: err instanceof Error ? err.message : "Request failed",
    };
  }
}
