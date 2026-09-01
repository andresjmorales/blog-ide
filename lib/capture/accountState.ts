import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { PushbulletCursor } from "@/lib/pushbullet/types";
import type { NtfyCursor } from "@/lib/ntfy/cursor";

export type CaptureState = {
  pushbullet?: PushbulletCursor;
  ntfy?: NtfyCursor;
};

function asStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

function asPushbulletCursor(value: unknown): PushbulletCursor | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const modifiedAfter =
    typeof rec.modifiedAfter === "number" && Number.isFinite(rec.modifiedAfter)
      ? rec.modifiedAfter
      : null;
  return { modifiedAfter, ingested: asStringIds(rec.ingested) };
}

function asNtfyCursor(value: unknown): NtfyCursor | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const since =
    typeof rec.since === "number" && Number.isFinite(rec.since)
      ? rec.since
      : null;
  return { since, ingested: asStringIds(rec.ingested) };
}

export function parseCaptureState(value: unknown): CaptureState {
  if (!value || typeof value !== "object") return {};
  const rec = value as Record<string, unknown>;
  const next: CaptureState = {};
  if ("pushbullet" in rec && rec.pushbullet && typeof rec.pushbullet === "object") {
    next.pushbullet = asPushbulletCursor(rec.pushbullet);
  }
  if ("ntfy" in rec && rec.ntfy && typeof rec.ntfy === "object") {
    next.ntfy = asNtfyCursor(rec.ntfy);
  }
  return next;
}

export function mergeIdLists(a: string[], b: string[], max = 400): string[] {
  const seen = new Set(a);
  for (const id of b) seen.add(id);
  return [...seen].slice(-max);
}

export async function loadAccountCaptureState(): Promise<CaptureState> {
  if (!isSupabaseConfigured()) return {};
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const { data, error } = await supabase
    .from("user_settings")
    .select("capture_state")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return {};
  return parseCaptureState(data.capture_state);
}

export async function saveAccountCaptureState(
  patch: CaptureState
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const current = await loadAccountCaptureState();
  const next: CaptureState = {
    pushbullet: patch.pushbullet ?? current.pushbullet,
    ntfy: patch.ntfy ?? current.ntfy,
  };
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      capture_state: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
