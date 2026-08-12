import { createClient } from "@/lib/supabase/client";
import { ASSETS_BUCKET } from "@/lib/assets/paths";
import { classifyStorageError, isBrowserOffline } from "@/lib/assets/errors";

export type AssetKind = "essay_image" | "library_pdf";

export class QuotaExceededError extends Error {
  constructor(message = "Storage quota exceeded.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export type UploadProgress = {
  loaded: number;
  total: number;
  /** 0–100 */
  percent: number;
};

export type UploadUserAssetOptions = {
  kind?: AssetKind;
  /** Subpath under `{userId}/`, e.g. `library/foo.pdf`. Default: timestamped name. */
  relativePath?: string;
  nodeId?: string | null;
  onProgress?: (progress: UploadProgress) => void;
};

/**
 * Reserve quota, upload to the public `assets` bucket, register inventory.
 * Rolls back Storage + quota on failure after register/upload races.
 * Uses XHR when a progress callback is provided so large files can report %.
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

  if (isBrowserOffline()) {
    throw new Error(classifyStorageError(new Error("offline")));
  }

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

  try {
    if (options.onProgress) {
      await uploadWithProgress(fullPath, blob, contentType, options.onProgress);
    } else {
      const { error: uploadError } = await supabase.storage
        .from(ASSETS_BUCKET)
        .upload(fullPath, blob, {
          contentType,
          upsert: false,
        });
      if (uploadError) throw uploadError;
    }
  } catch (uploadError) {
    await supabase.rpc("release_asset_path", { p_path: fullPath });
    if (uploadError instanceof QuotaExceededError) throw uploadError;
    throw new Error(classifyStorageError(uploadError));
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

async function uploadWithProgress(
  fullPath: string,
  blob: Blob,
  contentType: string,
  onProgress: (progress: UploadProgress) => void
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!accessToken || !url || !anon) {
    const { error } = await supabase.storage
      .from(ASSETS_BUCKET)
      .upload(fullPath, blob, { contentType, upsert: false });
    if (error) throw error;
    onProgress({ loaded: blob.size, total: blob.size, percent: 100 });
    return;
  }

  const endpoint = `${url.replace(/\/+$/, "")}/storage/v1/object/${ASSETS_BUCKET}/${fullPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anon);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(
        100,
        Math.round((100 * event.loaded) / Math.max(1, event.total))
      );
      onProgress({ loaded: event.loaded, total: event.total, percent });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress({ loaded: blob.size, total: blob.size, percent: 100 });
        resolve();
        return;
      }
      let message = `Storage upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message || body.error || message;
      } catch {
        if (xhr.responseText) message = xhr.responseText.slice(0, 200);
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(blob);
  });
}

/** Delete a Storage object and release its quota row (no-op if missing). */
export async function deleteUserAsset(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(ASSETS_BUCKET).remove([path]);
  await supabase.rpc("release_asset_path", { p_path: path });
}
