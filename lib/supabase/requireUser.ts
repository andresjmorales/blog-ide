import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * API routes are excluded from the proxy matcher, so each route gates
 * itself. Returns a 401 response to send back, or null when the request is
 * from a signed-in user (or the app runs in unconfigured preview mode).
 */
export async function requireUser(): Promise<NextResponse | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return null;
}
