import { createClient } from "@/lib/supabase/client";
import { ASSETS_BUCKET } from "@/lib/assets/paths";

export type AssetKind = "essay_image" | "library_pdf";

export class QuotaExceededError extends Error {
  constructor(message = "Storage quota exceeded.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export type UploadUserAssetOptions = {
  kind?: AssetKind;
  /** Subpath under `{userId}/`, e.g. `library/foo.pdf`. Default: timestamped name. */
  relativePath?: string;
  nodeId?: string | null;
};

/**
 * Reserve quota, upload to the public `assets` bucket, register inventory.
 * Rolls back Storage + quota on failure after register/upload races.
 */
export async function uploadUserAsset(
  blob: Blob,
  fileName: string,
  options: UploadUserAssetOptions = {}
): Promise<string> {
  const kind = options.kind ?? "essay_image";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload assets");

  const safe = fileName.replace(/[^\w.\-]+/g, "_");
  const path =
    options.relativePath?.replace(/^\/+/, "") ||
    `${user.id}/${Date.now()}-${safe}`;
  const fullPath = path.startsWith(`${user.id}/`)
    ? path
    : `${user.id}/${path}`;

  const byteSize = blob.size;
  const contentType = blob.type || "application/octet-stream";

  const { data: reg, error: regError } = await supabase.rpc(
    "register_user_asset",
    {
      p_path: fullPath,
      p_byte_size: byteSize,
      p_content_type: contentType,
      p_kind: kind,
      p_node_id: options.nodeId ?? null,
    }
  );
  if (regError) throw regError;
  const payload = reg as { ok?: boolean; reason?: string } | null;
  if (payload && payload.ok === false) {
    if (payload.reason === "quota") {
      throw new QuotaExceededError();
    }
    throw new Error(payload.reason || "Could not reserve storage");
  }

  const { error: uploadError } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(fullPath, blob, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    await supabase.rpc("release_asset_path", { p_path: fullPath });
    throw uploadError;
  }

  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(fullPath);
  if (data?.publicUrl) return data.publicUrl;

  const signed = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUrl(fullPath, 60 * 60 * 24 * 365);
  if (signed.data?.signedUrl) return signed.data.signedUrl;

  await supabase.storage.from(ASSETS_BUCKET).remove([fullPath]);
  await supabase.rpc("release_asset_path", { p_path: fullPath });
  throw new Error("Upload succeeded but no URL was returned");
}

/** Delete a Storage object and release its quota row (no-op if missing). */
export async function deleteUserAsset(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(ASSETS_BUCKET).remove([path]);
  await supabase.rpc("release_asset_path", { p_path: path });
}
