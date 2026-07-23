import { createClient } from "@/lib/supabase/client";
import {
  QuotaExceededError,
  uploadUserAsset,
  deleteUserAsset,
} from "@/lib/assets/upload";
import { assetPathFromUrl } from "@/lib/assets/paths";
import { canonicalizeLibraryUrl } from "@/lib/library/urls";
import type { LibraryMeta } from "@/lib/library/sessionLibrary";

export type CloudLibraryRow = {
  id: string;
  kind: "pdf" | "link";
  title: string;
  url: string | null;
  asset_path: string | null;
  byte_size: number;
};

export async function fetchCloudLibraryItems(): Promise<CloudLibraryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("library_items")
    .select("id, kind, title, url, asset_path, byte_size")
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
  };
}

export async function publicUrlForAssetPath(path: string): Promise<string> {
  const supabase = createClient();
  const { data } = supabase.storage.from("assets").getPublicUrl(path);
  if (data?.publicUrl) return data.publicUrl;
  const signed = await supabase.storage
    .from("assets")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signed.data?.signedUrl) return signed.data.signedUrl;
  throw new Error("Could not resolve Library PDF URL");
}

export async function upsertCloudLibraryLink(input: {
  url: string;
  title?: string;
}): Promise<CloudLibraryRow> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save Library links");

  const canonical = canonicalizeLibraryUrl(input.url);
  const url = canonical || input.url.trim();
  const title = (input.title || url).trim() || url;

  const { data: existing } = await supabase
    .from("library_items")
    .select("id, kind, title, url, asset_path, byte_size")
    .eq("kind", "link")
    .eq("url", url)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("library_items")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id, kind, title, url, asset_path, byte_size")
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
    })
    .select("id, kind, title, url, asset_path, byte_size")
    .single();
  if (error) throw error;
  return data as CloudLibraryRow;
}

export async function uploadCloudLibraryPdf(file: File): Promise<{
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
    .select("id, kind, title, url, asset_path, byte_size")
    .single();

  if (error) {
    await deleteUserAsset(assetPath).catch(() => {});
    throw error;
  }

  return { row: data as CloudLibraryRow, src };
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
