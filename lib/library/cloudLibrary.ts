import { createClient } from "@/lib/supabase/client";
import {
  QuotaExceededError,
  uploadUserAsset,
  deleteUserAsset,
  type UploadProgress,
} from "@/lib/assets/upload";
import { createAssetSignedUrl } from "@/lib/assets/signedUrls";
import { assetPathFromUrl } from "@/lib/assets/paths";
import { canonicalizeLibraryUrl } from "@/lib/library/urls";
import type { LibraryMeta } from "@/lib/library/sessionLibrary";

const LIBRARY_ITEM_COLUMNS =
  "id, kind, title, url, asset_path, byte_size, bibtex, cite_key";

export type CloudLibraryRow = {
  id: string;
  kind: "pdf" | "link" | "bibtex";
  title: string;
  url: string | null;
  asset_path: string | null;
  byte_size: number;
  bibtex: string | null;
  cite_key: string | null;
};

export async function fetchCloudLibraryItems(): Promise<CloudLibraryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("library_items")
    .select(LIBRARY_ITEM_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CloudLibraryRow[];
}

export function cloudRowToMeta(row: CloudLibraryRow): LibraryMeta {
  return {
    id: row.id,
    kind: row.kind,
    name: row.title,
    url: row.url ?? undefined,
    assetPath: row.asset_path ?? undefined,
    byteSize: row.byte_size,
    bibtex: row.bibtex ?? undefined,
    citeKey: row.cite_key ?? undefined,
  };
}

export async function publicUrlForAssetPath(path: string): Promise<string> {
  return createAssetSignedUrl(path);
}

export async function upsertCloudLibraryLink(input: {
  url: string;
  title?: string;
  bibtex?: string;
  citeKey?: string;
}): Promise<CloudLibraryRow> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save Library links");

  const canonical = canonicalizeLibraryUrl(input.url);
  const url = canonical || input.url.trim();
  const title = (input.title || url).trim() || url;
  const bibtex = input.bibtex?.trim() || null;
  const citeKey = input.citeKey?.trim() || null;

  const { data: existing } = await supabase
    .from("library_items")
    .select(LIBRARY_ITEM_COLUMNS)
    .eq("kind", "link")
    .eq("url", url)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {
      title,
      updated_at: new Date().toISOString(),
    };
    if (bibtex) {
      patch.bibtex = bibtex;
      patch.cite_key = citeKey;
    }
    const { data, error } = await supabase
      .from("library_items")
      .update(patch)
      .eq("id", existing.id)
      .select(LIBRARY_ITEM_COLUMNS)
      .single();
    if (error) throw error;
    return data as CloudLibraryRow;
  }

  const { data, error } = await supabase
    .from("library_items")
    .insert({
      user_id: user.id,
      kind: "link",
      title,
      url,
      asset_path: null,
      byte_size: 0,
      bibtex,
      cite_key: citeKey,
    })
    .select(LIBRARY_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as CloudLibraryRow;
}

export async function uploadCloudLibraryPdf(
  file: File,
  options?: { onProgress?: (progress: UploadProgress) => void }
): Promise<{
  row: CloudLibraryRow;
  src: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload Library PDFs");

  const id = crypto.randomUUID();
  const name = file.name.trim() || "document.pdf";
  const safe = name.replace(/[^\w.\-]+/g, "_");
  const relativePath = `library/${id}-${safe}`;

  let src: string;
  try {
    src = await uploadUserAsset(file, safe, {
      kind: "library_pdf",
      relativePath,
      onProgress: options?.onProgress,
    });
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    throw err;
  }

  const assetPath = assetPathFromUrl(src, user.id) || `${user.id}/${relativePath}`;

  const { data, error } = await supabase
    .from("library_items")
    .insert({
      id,
      user_id: user.id,
      kind: "pdf",
      title: name,
      url: src,
      asset_path: assetPath,
      byte_size: file.size,
    })
    .select(LIBRARY_ITEM_COLUMNS)
    .single();

  if (error) {
    await deleteUserAsset(assetPath).catch(() => {});
    throw error;
  }

  return { row: data as CloudLibraryRow, src };
}

export async function upsertCloudLibraryBibtex(input: {
  citeKey: string;
  title: string;
  bibtex: string;
  url?: string;
}): Promise<CloudLibraryRow> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save Library BibTeX");

  const citeKey = input.citeKey.trim();
  if (!citeKey) throw new Error("Missing BibTeX cite key.");
  const title = (input.title || citeKey).trim() || citeKey;
  const bibtex = input.bibtex.trim();
  const url = input.url?.trim() || null;
  const byteSize = new TextEncoder().encode(bibtex).length;

  const { data: existing } = await supabase
    .from("library_items")
    .select(LIBRARY_ITEM_COLUMNS)
    .eq("kind", "bibtex")
    .eq("cite_key", citeKey)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("library_items")
      .update({
        title,
        bibtex,
        url,
        byte_size: byteSize,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(LIBRARY_ITEM_COLUMNS)
      .single();
    if (error) throw error;
    return data as CloudLibraryRow;
  }

  const { data, error } = await supabase
    .from("library_items")
    .insert({
      user_id: user.id,
      kind: "bibtex",
      title,
      url,
      asset_path: null,
      byte_size: byteSize,
      bibtex,
      cite_key: citeKey,
    })
    .select(LIBRARY_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as CloudLibraryRow;
}

export async function deleteCloudLibraryItem(id: string): Promise<void> {
  const supabase = createClient();
  const { data: row, error: fetchError } = await supabase
    .from("library_items")
    .select("id, kind, asset_path")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!row) return;

  const { error } = await supabase.from("library_items").delete().eq("id", id);
  if (error) throw error;

  if (row.kind === "pdf" && row.asset_path) {
    await deleteUserAsset(row.asset_path).catch(() => {});
  }
}
