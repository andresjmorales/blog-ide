import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type EditorPrefs = {
  leftWidth?: number;   // px
  rightWidth?: number;  // px
  leftOpen?: boolean;
  rightOpen?: boolean;
  rightTab?: "ai" | "preview";
};

const LOCAL_KEY = "blogide.editorPrefs";

export function loadLocalPrefs(): EditorPrefs {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Persist prefs locally (instant) and to user_settings (fire-and-forget). */
export function savePrefs(prefs: EditorPrefs) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));

  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    void supabase
      .from("user_settings")
      .upsert(
        { user_id: user.id, editor_prefs: prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .then(() => {});
  });
}
