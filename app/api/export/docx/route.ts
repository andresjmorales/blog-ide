import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import {
  checkRateLimit,
  clientIpFromRequest,
  hitRateLimit,
} from "@/lib/rateLimit";
import {
  markdownToDocx,
  PandocUnavailableError,
} from "@/lib/pandoc/run";

export const runtime = "nodejs";

const LIMIT = 8;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const ip = clientIpFromRequest(request);
  const limit = checkRateLimit(`pandoc-export:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many exports. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let body: { markdown?: string; title?: string };
  try {
    body = (await request.json()) as { markdown?: string; title?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  if (!markdown.trim()) {
    return NextResponse.json({ error: "Nothing to export." }, { status: 400 });
  }

  try {
    const docx = await markdownToDocx(markdown);
    hitRateLimit(`pandoc-export:${ip}`, WINDOW_MS);
    const title = (body.title || "essay").replace(/[\\/:*?"<>|]+/g, "-");
    const fileName = title.toLowerCase().endsWith(".docx")
      ? title
      : `${title}.docx`;
    return new NextResponse(new Uint8Array(docx), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof PandocUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Pandoc export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
