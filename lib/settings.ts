import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type SidenoteLayout = "anchored" | "sticky";

export type EditorPrefs = {
  leftWidth?: number; // px
  rightWidth?: number; // px
  leftOpen?: boolean;
  rightOpen?: boolean;
  rightTab?: "ai" | "preview";
  /** Show margin sidenotes beside the prose. */
  sidenotes?: boolean;
  /** Anchored to each footnote, or sticky/proximity packing in the gutter. */
  sidenoteLayout?: SidenoteLayout;
  /** Open the footnote editor card on superscript hover. */
  footnoteOpenOnHover?: boolean;
  /** Browser spellcheck in the editor (off by default). */
  spellcheckEnabled?: boolean;
  /** Default BCP-47 language tags when a document has none set. */
  spellcheckLanguages?: string[];
};

export const DEFAULT_EDITOR_PREFS: Required<EditorPrefs> = {
  leftWidth: 240,
  rightWidth: 320,
  leftOpen: true,
  rightOpen: true,
  rightTab: "ai",
  sidenotes: true,
  sidenoteLayout: "sticky",
  footnoteOpenOnHover: true,
  spellcheckEnabled: false,
  spellcheckLanguages: ["en-US"],
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

export function mergePrefs(partial: EditorPrefs = {}): Required<EditorPrefs> {
  return { ...DEFAULT_EDITOR_PREFS, ...partial };
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
        {
          user_id: user.id,
          editor_prefs: prefs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .then(() => {});
  });
}
