/**
 * Session-local Library: PDF blobs stay in memory; link bookmarks store a URL.
 * Meta persists in sessionStorage so the panel can list entries after a soft
 * reload (PDF object URLs still need a re-pick after a full tab close).
 */

export type LibraryKind = "pdf" | "link";

export type LibraryMeta = {
  id: string;
  kind: LibraryKind;
  name: string;
  /** Present for kind === "link". */
  url?: string;
};

type LibraryPdfEntry = LibraryMeta & {
  kind: "pdf";
  src: string;
  revokeOnClose: boolean;
};

const STORAGE_KEY = "blogide.library.v1";

const fileById = new Map<string, File>();
const srcById = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function normalizeMeta(raw: unknown): LibraryMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: LibraryMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const name = typeof record.name === "string" ? record.name : "";
    if (!id || !name) continue;
    if (record.kind === "link" || (typeof record.url === "string" && record.url)) {
      const url =
        typeof record.url === "string" && record.url.trim()
          ? record.url.trim()
          : "";
      if (!url) continue;
      out.push({ id, kind: "link", name, url });
      continue;
    }
    // Legacy rows were PDF-only `{ id, name }`.
    out.push({ id, kind: "pdf", name });
  }
  return out;
}

function loadMeta(): LibraryMeta[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeMeta(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveMeta(entries: LibraryMeta[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode */
  }
}

let meta = loadMeta();

/** Stable empty snapshot for SSR / useSyncExternalStore. */
const EMPTY_META: LibraryMeta[] = [];

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Cached snapshot — must return the same reference between emits or
 * useSyncExternalStore loops (getSnapshot should be cached).
 */
export function listLibraryEntries(): LibraryMeta[] {
  return meta;
}

export function getLibraryServerSnapshot(): LibraryMeta[] {
  return EMPTY_META;
}

export function getLibrarySrc(id: string): string | null {
  return srcById.get(id) ?? null;
}

export function addLibraryPdf(file: File): LibraryPdfEntry {
  const id = `lib:${crypto.randomUUID()}`;
  const src = URL.createObjectURL(file);
  // Keep the extension so Library entries read as real files (report.pdf).
  const name = file.name.trim() || "document.pdf";
  fileById.set(id, file);
  srcById.set(id, src);
  meta = [...meta.filter((e) => e.id !== id), { id, kind: "pdf", name }];
  saveMeta(meta);
  emit();
  return { id, kind: "pdf", name, src, revokeOnClose: true };
}

/** Normalize for Library link identity (trailing slash / default ports). */
export function canonicalizeLibraryUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    // Drop default ports; keep a stable href for matching.
    return parsed.href.replace(/\/$/, "") || parsed.origin;
  } catch {
    return null;
  }
}

export function findLibraryLinkByUrl(raw: string): LibraryMeta | null {
  const canonical = canonicalizeLibraryUrl(raw);
  if (!canonical) return null;
  return (
    meta.find(
      (entry) =>
        entry.kind === "link" &&
        entry.url &&
        canonicalizeLibraryUrl(entry.url) === canonical
    ) ?? null
  );
}

export function isLibraryLink(raw: string): boolean {
  return findLibraryLinkByUrl(raw) != null;
}

export function addLibraryLink(input: {
  url: string;
  title?: string;
}): LibraryMeta {
  const canonical = canonicalizeLibraryUrl(input.url);
  const url = canonical || input.url.trim();
  const id = `lib-link:${url}`;
  const name = (input.title || url).trim() || url;
  const entry: LibraryMeta = { id, kind: "link", name, url };
  meta = [
    ...meta.filter(
      (e) =>
        e.id !== id &&
        !(e.kind === "link" && e.url && canonicalizeLibraryUrl(e.url) === url)
    ),
    entry,
  ];
  saveMeta(meta);
  emit();
  return entry;
}

/** Toggle: add if missing, remove if already bookmarked. */
export function toggleLibraryLink(input: {
  url: string;
  title?: string;
}): { added: boolean; entry: LibraryMeta | null } {
  const existing = findLibraryLinkByUrl(input.url);
  if (existing) {
    removeLibraryEntry(existing.id);
    return { added: false, entry: null };
  }
  return { added: true, entry: addLibraryLink(input) };
}

export function removeLibraryEntry(id: string): void {
  const src = srcById.get(id);
  if (src) {
    try {
      URL.revokeObjectURL(src);
    } catch {
      /* ignore */
    }
  }
  srcById.delete(id);
  fileById.delete(id);
  meta = meta.filter((e) => e.id !== id);
  saveMeta(meta);
  emit();
}
