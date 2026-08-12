import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { assertPandocAvailable } from "@/lib/pandoc/run";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireUser();
  if (denied) return denied;
  try {
    await assertPandocAvailable();
    return NextResponse.json({ available: true });
  } catch {
    return NextResponse.json({ available: false });
  }
}
