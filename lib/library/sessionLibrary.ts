/**
 * Session-local PDF library: File blobs stay in memory; names persist in
 * sessionStorage so the Library panel can list pins after a soft reload
 * (object URLs still need a re-pick after a full tab close).
 */

export type LibraryMeta = {
  id: string;
  name: string;
};

type LibraryEntry = LibraryMeta & {
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

function loadMeta(): LibraryMeta[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryMeta[];
    return Array.isArray(parsed) ? parsed : [];
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

export function addLibraryPdf(file: File): LibraryEntry {
  const id = `lib:${crypto.randomUUID()}`;
  const src = URL.createObjectURL(file);
  // Keep the extension so Library entries read as real files (report.pdf).
  const name = file.name.trim() || "document.pdf";
  fileById.set(id, file);
  srcById.set(id, src);
  meta = [...meta.filter((e) => e.id !== id), { id, name }];
  saveMeta(meta);
  emit();
  return { id, name, src, revokeOnClose: true };
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
