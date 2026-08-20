import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DEFAULT_PANEL_LAYOUT,
  panelLayoutFromLegacy,
  type PanelLayout,
} from "@/lib/panels/layout";

export type SidenoteLayout = "anchored" | "sticky";

/** Rich-text markdown typing shortcuts (TipTap input rules). */
export type MarkdownTypingShortcuts = "conservative" | "full";

export type EditorPrefs = {
  leftWidth?: number; // px
  rightWidth?: number; // px
  leftOpen?: boolean;
  rightOpen?: boolean;
  /** @deprecated Prefer panelLayout — kept for mobile drawers / migration. */
  rightTab?: "library" | "ai" | (string & {});
  /** @deprecated Prefer panelLayout.visible.shell */
  shellOpen?: boolean;
  /** Desktop Shell / bottom dock height in px. */
  shellHeight?: number;
  /** IDE dock layout (Files / AI / Shell). */
  panelLayout?: PanelLayout;
  /** On phone, land on Shell/terminal by default (vs full editor). */
  mobileOpenShell?: boolean;
  /** Show margin sidenotes beside the prose. */
  sidenotes?: boolean;
  /** Anchored beside each mark, or a scrollable rail of all notes. */
  sidenoteLayout?: SidenoteLayout;
  /** Open the footnote editor card on superscript hover. */
  footnoteOpenOnHover?: boolean;
  /**
   * Reserved: OG chrome on the link edit bubble (Open / Pin / Library).
   * Currently always on in DocumentEditor; pref kept for future toggle.
   */
  linkPreviews?: boolean;
  /** Browser spellcheck in the editor (off by default). */
  spellcheckEnabled?: boolean;
  /** Default BCP-47 language tags when a document has none set. */
  spellcheckLanguages?: string[];
  /**
   * Dash style for Cleanup punctuation normalize / citation defaults.
   * Chicago: em dash without spaces; MLA: spaced en dash.
   */
  dashStyle?: "chicago" | "mla";
  /**
   * Markdown auto-transforms while typing in rich text.
   * `conservative` (default): lists, headings, code only.
   * `full`: also bold/italic/strike/blockquote/HR from markdown punctuation.
   */
  markdownTypingShortcuts?: MarkdownTypingShortcuts;
  /**
   * TipTap Typography while typing: curly quotes, `--` → em dash, `...` →
   * ellipsis, arrows, and a few symbols. Independent of Cleanup punctuation.
   * Default on. Immediate Backspace / Ctrl+Z restores the original characters.
   */
  typography?: boolean;
  /**
   * @deprecated Use `typography`. Still read when merging older saved prefs.
   */
  smartQuotes?: boolean;
  /**
   * Opt-in fetch(bible): highlight English scripture references and open a
   * pinned Berean Standard Bible reader. Off by default.
   */
  fetchBibleEnabled?: boolean;
  /** Width (px) of the editable markdown pane in split view. */
  markdownSplitWidth?: number;
  /**
   * When true, overflow offers “Markdown only” (full-pane source) and narrow
   * viewports may auto-open that mode. Default off: View raw markdown → split.
   */
  allowMarkdownOnly?: boolean;
};

export const DEFAULT_EDITOR_PREFS: Required<EditorPrefs> = {
  leftWidth: 240,
  rightWidth: 320,
  leftOpen: true,
  rightOpen: true,
  rightTab: "library",
  shellOpen: false,
  shellHeight: 220,
  panelLayout: DEFAULT_PANEL_LAYOUT,
  mobileOpenShell: true,
  sidenotes: true,
  sidenoteLayout: "sticky",
  footnoteOpenOnHover: true,
  linkPreviews: false,
  spellcheckEnabled: false,
  spellcheckLanguages: ["en-US"],
  dashStyle: "chicago",
  markdownTypingShortcuts: "conservative",
  typography: true,
  smartQuotes: true,
  fetchBibleEnabled: false,
  markdownSplitWidth: 480,
  allowMarkdownOnly: false,
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
  const merged = { ...DEFAULT_EDITOR_PREFS, ...partial };
  const typography =
    partial.typography ??
    partial.smartQuotes ??
    DEFAULT_EDITOR_PREFS.typography;
  const panelLayout = panelLayoutFromLegacy({
    ...merged,
    panelLayout: partial.panelLayout ?? merged.panelLayout,
  });
  return {
    ...merged,
    typography,
    smartQuotes: typography,
    panelLayout,
    leftWidth: panelLayout.sizes.left,
    rightWidth: panelLayout.sizes.right,
    shellHeight: panelLayout.sizes.bottom,
    leftOpen: panelLayout.visible.files,
    rightOpen: panelLayout.visible.ai,
    shellOpen: panelLayout.visible.shell,
  };
}

let remotePrefsTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRemotePrefs: EditorPrefs | null = null;

function flushRemotePrefs() {
  remotePrefsTimer = null;
  const prefs = pendingRemotePrefs;
  pendingRemotePrefs = null;
  if (!prefs || !isSupabaseConfigured()) return;

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

/** Persist prefs locally (instant) and to user_settings (debounced). */
export function savePrefs(prefs: EditorPrefs) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));

  if (!isSupabaseConfigured()) return;

  pendingRemotePrefs = prefs;
  if (remotePrefsTimer) clearTimeout(remotePrefsTimer);
  remotePrefsTimer = setTimeout(flushRemotePrefs, 450);
}
