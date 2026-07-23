import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { assertSafePublicUrl } from "@/lib/preview/ssrf";

export const runtime = "nodejs";

const TIMEOUT_MS = 5000;
const MAX_URLS_PER_REQUEST = 20;

export type UrlCheckResult = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
};

async function probeUrl(raw: string): Promise<UrlCheckResult> {
  try {
    const safe = await assertSafePublicUrl(raw);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let response = await fetch(safe.href, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "BlogIDE-UrlCheck/1.0" },
      });
      // Some hosts reject HEAD — fall back to a light GET.
      if (response.status === 405 || response.status === 501) {
        response = await fetch(safe.href, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": "BlogIDE-UrlCheck/1.0",
            Range: "bytes=0-0",
          },
        });
      }
      await assertSafePublicUrl(response.url);
      const ok = response.status >= 200 && response.status < 400;
      return {
        url: raw,
        ok,
        status: response.status,
        error: ok ? undefined : `HTTP ${response.status}`,
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

export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const urls = Array.isArray((body as { urls?: unknown }).urls)
    ? ((body as { urls: unknown[] }).urls)
        .filter((u): u is string => typeof u === "string")
        .slice(0, MAX_URLS_PER_REQUEST)
    : [];

  if (urls.length === 0) {
    return NextResponse.json({ error: "Missing urls" }, { status: 400 });
  }

  const results = await Promise.all(urls.map((url) => probeUrl(url)));
  return NextResponse.json({ results });
}
