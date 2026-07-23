/**
 * Library store: session cache + optional Supabase durability when signed in.
 * Preview / unauthenticated mode stays session-only (PDFs in memory).
 */

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import {
  cloudRowToMeta,
  deleteCloudLibraryItem,
  fetchCloudLibraryItems,
  publicUrlForAssetPath,
  uploadCloudLibraryPdf,
  upsertCloudLibraryLink,
} from "@/lib/library/cloudLibrary";
import { canonicalizeLibraryUrl } from "@/lib/library/urls";

export { canonicalizeLibraryUrl };

export type LibraryKind = "pdf" | "link";

export type LibraryMeta = {
  id: string;
  kind: LibraryKind;
  name: string;
  /** Present for kind === "link" (and sometimes pdf public URL). */
  url?: string;
  assetPath?: string;
  byteSize?: number;
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
      out.push({
        id,
        kind: "link",
        name,
        url,
        assetPath:
          typeof record.assetPath === "string" ? record.assetPath : undefined,
        byteSize:
          typeof record.byteSize === "number" ? record.byteSize : undefined,
      });
      continue;
    }
    out.push({
      id,
      kind: "pdf",
      name,
      url: typeof record.url === "string" ? record.url : undefined,
      assetPath:
        typeof record.assetPath === "string" ? record.assetPath : undefined,
      byteSize: typeof record.byteSize === "number" ? record.byteSize : undefined,
    });
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
let hydratePromise: Promise<void> | null = null;

/** Stable empty snapshot for SSR / useSyncExternalStore. */
const EMPTY_META: LibraryMeta[] = [];

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listLibraryEntries(): LibraryMeta[] {
  return meta;
}

export function getLibraryServerSnapshot(): LibraryMeta[] {
  return EMPTY_META;
}

export function getLibrarySrc(id: string): string | null {
  return srcById.get(id) ?? null;
}

async function signedIn(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

/** Pull durable Library rows from Supabase into the session cache. */
export async function hydrateLibraryFromCloud(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    if (!(await signedIn())) return;
    try {
      const rows = await fetchCloudLibraryItems();
      const next: LibraryMeta[] = [];
      for (const row of rows) {
        const entry = cloudRowToMeta(row);
        next.push(entry);
        if (row.kind === "pdf" && row.asset_path) {
          try {
            const src =
              row.url || (await publicUrlForAssetPath(row.asset_path));
            srcById.set(row.id, src);
          } catch {
            /* open will re-resolve */
          }
        } else if (row.kind === "pdf" && row.url) {
          srcById.set(row.id, row.url);
        }
      }
      meta = next;
      saveMeta(meta);
      emit();
    } catch {
      /* keep session cache */
    }
  })();
  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export function addLibraryPdf(file: File): LibraryPdfEntry {
  const id = `lib:${crypto.randomUUID()}`;
  const src = URL.createObjectURL(file);
  const name = file.name.trim() || "document.pdf";
  fileById.set(id, file);
  srcById.set(id, src);
  meta = [...meta.filter((e) => e.id !== id), { id, kind: "pdf", name }];
  saveMeta(meta);
  emit();
  return { id, kind: "pdf", name, src, revokeOnClose: true };
}

/** Prefer cloud upload when signed in; otherwise session-only. */
export async function addLibraryPdfDurable(file: File): Promise<LibraryPdfEntry> {
  if (await signedIn()) {
    const { row, src } = await uploadCloudLibraryPdf(file);
    srcById.set(row.id, src);
    const entry = cloudRowToMeta(row);
    meta = [...meta.filter((e) => e.id !== entry.id), entry];
    saveMeta(meta);
    emit();
    return {
      id: entry.id,
      kind: "pdf",
      name: entry.name,
      src,
      revokeOnClose: false,
      url: entry.url,
      assetPath: entry.assetPath,
      byteSize: entry.byteSize,
    };
  }
  return addLibraryPdf(file);
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

export async function addLibraryLinkDurable(input: {
  url: string;
  title?: string;
}): Promise<LibraryMeta> {
  if (await signedIn()) {
    const row = await upsertCloudLibraryLink(input);
    const entry = cloudRowToMeta(row);
    meta = [
      ...meta.filter(
        (e) =>
          e.id !== entry.id &&
          !(
            e.kind === "link" &&
            e.url &&
            canonicalizeLibraryUrl(e.url) === canonicalizeLibraryUrl(entry.url || "")
          )
      ),
      entry,
    ];
    saveMeta(meta);
    emit();
    return entry;
  }
  return addLibraryLink(input);
}

export function toggleLibraryLink(input: {
  url: string;
  title?: string;
}): { added: boolean; entry: LibraryMeta | null } {
  const existing = findLibraryLinkByUrl(input.url);
  if (existing) {
    void removeLibraryEntryDurable(existing.id);
    return { added: false, entry: null };
  }
  const optimistic = addLibraryLink(input);
  void (async () => {
    if (await signedIn()) {
      try {
        const row = await upsertCloudLibraryLink({
          url: input.url,
          title: input.title,
        });
        const entry = cloudRowToMeta(row);
        meta = [
          ...meta.filter(
            (e) =>
              e.id !== optimistic.id &&
              e.id !== entry.id &&
              !(
                e.kind === "link" &&
                e.url &&
                canonicalizeLibraryUrl(e.url) ===
                  canonicalizeLibraryUrl(entry.url || "")
              )
          ),
          entry,
        ];
        saveMeta(meta);
        emit();
      } catch {
        /* keep optimistic session entry */
      }
    }
  })();
  return { added: true, entry: optimistic };
}

export async function toggleLibraryLinkDurable(input: {
  url: string;
  title?: string;
}): Promise<{ added: boolean; entry: LibraryMeta | null }> {
  const existing = findLibraryLinkByUrl(input.url);
  if (existing) {
    await removeLibraryEntryDurable(existing.id);
    return { added: false, entry: null };
  }
  const entry = await addLibraryLinkDurable(input);
  return { added: true, entry };
}

export function removeLibraryEntry(id: string): void {
  const src = srcById.get(id);
  if (src?.startsWith("blob:")) {
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

export async function removeLibraryEntryDurable(id: string): Promise<void> {
  removeLibraryEntry(id);
  if (await signedIn()) {
    try {
      await deleteCloudLibraryItem(id);
    } catch {
      /* session already cleared */
    }
  }
}

/** Resolve a PDF src for opening a pin (cloud URL or local blob). */
export async function resolveLibraryPdfSrc(
  entry: LibraryMeta
): Promise<string | null> {
  const cached = getLibrarySrc(entry.id);
  if (cached) return cached;
  if (entry.url && entry.kind === "pdf") {
    srcById.set(entry.id, entry.url);
    return entry.url;
  }
  if (entry.assetPath) {
    const src = await publicUrlForAssetPath(entry.assetPath);
    srcById.set(entry.id, src);
    return src;
  }
  return null;
}
