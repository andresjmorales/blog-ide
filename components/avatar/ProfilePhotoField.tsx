"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarCropDialog } from "@/components/avatar/AvatarCropDialog";
import {
  AVATAR_ACCEPT,
  AVATAR_MAX_INPUT_BYTES,
  AVATAR_OUTPUT_MIME,
} from "@/lib/avatar/constants";
import {
  AVATARS_BUCKET,
  avatarStoragePath,
  withAvatarCacheBust,
} from "@/lib/avatar/paths";
import { createClient } from "@/lib/supabase/client";

type Props = {
  initialUrl: string | null;
  displayName: string;
  onUrlChange?: (url: string | null) => void;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function ProfilePhotoField({
  initialUrl,
  displayName,
  onUrlChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  function openPicker() {
    setMessage(null);
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choose an image file.");
      return;
    }
    if (file.size > AVATAR_MAX_INPUT_BYTES) {
      setMessage("Image must be under 8 MB.");
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
  }

  async function uploadCropped(blob: Blob) {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const path = avatarStoragePath(user.id);
      const { error: uploadError } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, blob, {
          contentType: AVATAR_OUTPUT_MIME,
          upsert: true,
          cacheControl: "3600",
        });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
      const publicUrl = withAvatarCacheBust(data.publicUrl);

      const { error } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });
      if (error) throw error;

      setUrl(publicUrl);
      onUrlChange?.(publicUrl);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      setMessage("Photo updated.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not upload photo."
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const path = avatarStoragePath(user.id);
      await supabase.storage.from(AVATARS_BUCKET).remove([path]);

      const { error } = await supabase.auth.updateUser({
        data: { avatar_url: "" },
      });
      if (error) throw error;

      setUrl(null);
      onUrlChange?.(null);
      setMessage("Photo removed.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Could not remove photo."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <div className="mb-2 text-sm">Profile photo</div>
      <div className="flex items-center gap-3">
        <div
          className="user-avatar !h-14 !w-14 !min-w-14 !p-0 overflow-hidden text-sm"
          aria-hidden
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{initialsFromName(displayName)}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={busy}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {url ? "Change photo" : "Upload photo"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => void removePhoto()}
              disabled={busy}
              className="settings-link-btn !mt-0 self-center"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="hidden"
        onChange={onFileChange}
      />
      {message && <p className="mt-2 text-xs text-muted">{message}</p>}
      {cropSrc && (
        <AvatarCropDialog
          src={cropSrc}
          busy={busy}
          onCancel={() => {
            if (busy) return;
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          onConfirm={uploadCropped}
        />
      )}
    </div>
  );
}
