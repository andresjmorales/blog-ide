import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import {
  checkRateLimit,
  clientIpFromRequest,
  hitRateLimit,
} from "@/lib/rateLimit";
import {
  documentToMarkdown,
  inferPandocImportFormat,
  PandocUnavailableError,
} from "@/lib/pandoc/run";

export const runtime = "nodejs";

const LIMIT = 8;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const ip = clientIpFromRequest(request);
  const limit = checkRateLimit(`pandoc-import:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many imports. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is too large to import (8 MiB limit)." },
      { status: 413 }
    );
  }

  const format = inferPandocImportFormat(file.name, file.type);
  if (!format) {
    return NextResponse.json(
      { error: "Import Word (.docx) or OpenDocument (.odt) files." },
      { status: 415 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const markdown = await documentToMarkdown(buffer, format);
    hitRateLimit(`pandoc-import:${ip}`, WINDOW_MS);
    return NextResponse.json({ markdown });
  } catch (error) {
    if (error instanceof PandocUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message =
      error instanceof Error ? error.message : "Pandoc import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
