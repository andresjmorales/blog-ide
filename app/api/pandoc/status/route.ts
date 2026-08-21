import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { assertPandocAvailable, resolvePandocPdfEngine } from "@/lib/pandoc/run";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    await assertPandocAvailable();
    const engine = await resolvePandocPdfEngine();
    return NextResponse.json({ available: true, pdf: Boolean(engine) });
  } catch {
    return NextResponse.json({ available: false, pdf: false });
  }
}
