/**
 * Phone layout: one full-screen surface at a time, picked from the header
 * switcher. Files stays a slide-over drawer on top of whichever is showing.
 */
export type MobileSurface = "editor" | "notes" | "ai" | "library";

/** What a phone lands on at launch (Settings → Editor → Start on phone). */
export type MobileStartSurface = "last" | "editor" | "notes";

export const MOBILE_SURFACES: readonly MobileSurface[] = [
  "editor",
  "notes",
  "ai",
  "library",
];

export const MOBILE_SURFACE_LABELS: Record<MobileSurface, string> = {
  editor: "Editor",
  notes: "Notes",
  ai: "AI Assistant",
  library: "Library",
};

/** Query param used by home-screen shortcuts (`/editor?surface=notes`). */
export const SURFACE_PARAM = "surface";

/** history.state key marking an entry pushed by the switcher. */
export const SURFACE_HISTORY_KEY = "blogideSurface";

const LAST_KEY = "blogide.mobileSurface.last";

export function isMobileSurface(value: unknown): value is MobileSurface {
  return (
    typeof value === "string" &&
    (MOBILE_SURFACES as readonly string[]).includes(value)
  );
}

export function parseSurfaceParam(
  value: string | null | undefined
): MobileSurface | null {
  const v = value?.trim().toLowerCase();
  if (v === "assistant") return "ai";
  if (v === "shell") return "notes";
  return isMobileSurface(v) ? v : null;
}

export function loadLastMobileSurface(): MobileSurface | null {
  try {
    const value = localStorage.getItem(LAST_KEY);
    return isMobileSurface(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLastMobileSurface(surface: MobileSurface): void {
  try {
    localStorage.setItem(LAST_KEY, surface);
  } catch {
    /* private mode / blocked storage — "last" just falls back to Editor */
  }
}

/** Launch surface: explicit shortcut param, else the Start-on preference. */
export function resolveStartSurface(input: {
  param: MobileSurface | null;
  start: MobileStartSurface;
  last: MobileSurface | null;
}): MobileSurface {
  if (input.param) return input.param;
  if (input.start === "last") return input.last ?? "editor";
  return input.start;
}

/**
 * Android's share sheet puts the link in `url`, `text`, or both (often as
 * "Page title https://…"). Returns the first http(s) URL found.
 */
export function extractSharedUrl(fields: {
  url?: string | null;
  text?: string | null;
  title?: string | null;
}): string | null {
  for (const raw of [fields.url, fields.text, fields.title]) {
    if (!raw) continue;
    const match = raw.match(/https?:\/\/[^\s<>"']+/i);
    if (!match) continue;
    const candidate = match[0].replace(/[),.;:!?\]]+$/, "");
    try {
      return new URL(candidate).href;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Title for a shared link: the share's title, or the text minus the URL. */
export function sharedLinkTitle(
  fields: { text?: string | null; title?: string | null },
  url: string
): string | undefined {
  const title = fields.title?.trim();
  if (title && !/^https?:\/\//i.test(title)) return title;
  const text = fields.text?.replace(url, "").replace(/https?:\/\/\S+/gi, "").trim();
  return text || undefined;
}
