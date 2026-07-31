import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { probeUrl } from "@/lib/preview/urlCheck";

export const runtime = "nodejs";

const MAX_URLS_PER_REQUEST = 20;

export type { UrlCheckResult } from "@/lib/preview/urlCheck";

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
