/**
 * Shared compress → upload → setImage path for toolbar, paste, and drop.
 */
import type { Editor } from "@tiptap/core";
import { compressImageFile } from "@/lib/assets/imagePipeline";
import {
  classifyStorageError,
  isBrowserOffline,
} from "@/lib/assets/errors";
import {
  beginUploadStatus,
  updateUploadStatus,
} from "@/lib/assets/uploadStatus";
import {
  QuotaExceededError,
  uploadUserAsset,
} from "@/lib/assets/upload";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export type InsertEssayImageDialogs = {
  /**
   * Optional alt prompt. Omit to insert immediately (paste/drop) — alt can
   * be edited on the selected figure.
   */
  promptAlt?: () => Promise<string | null>;
  alertQuota: () => Promise<void>;
  alertError: (message: string) => Promise<void>;
};

/**
 * Compress and upload (or data-URL fallback) then insert at the current
 * selection. Returns true if an image was inserted.
 */
export async function insertEssayImageFromFile(
  editor: Editor,
  file: File,
  dialogs: InsertEssayImageDialogs
): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;
  const statusId = beginUploadStatus("compressing", "Compressing image…");
  try {
    const compressed = await compressImageFile(file);
    let src: string;
    let usedDataUrl = false;
    try {
      if (isBrowserOffline()) {
        throw new Error("offline");
      }
      updateUploadStatus(statusId, {
        phase: "uploading",
        message: "Uploading image…",
        progress: 0,
      });
      const ext = compressed.mime === "image/webp" ? "webp" : "jpg";
      src = await uploadUserAsset(
        compressed.blob,
        file.name.replace(/\.\w+$/, "") + `.${ext}`,
        {
          kind: "essay_image",
          onProgress: (progress) => {
            updateUploadStatus(statusId, {
              phase: "uploading",
              progress: progress.percent,
              message: `Uploading image… ${progress.percent}%`,
            });
          },
        }
      );
    } catch (uploadErr) {
      if (uploadErr instanceof QuotaExceededError) {
        updateUploadStatus(statusId, {
          phase: "error",
          message: "Storage quota exceeded.",
        });
        await dialogs.alertQuota();
        return false;
      }
      src = await blobToDataUrl(compressed.blob);
      usedDataUrl = true;
      const offline = isBrowserOffline();
      updateUploadStatus(statusId, {
        phase: offline ? "offline" : "error",
        message: offline
          ? "Offline — image kept in the essay locally. Reconnect and re-upload to put it in Storage."
          : `${classifyStorageError(uploadErr)} A local copy was inserted so you can keep writing.`,
      });
    }
    const alt = dialogs.promptAlt
      ? ((await dialogs.promptAlt()) ?? "")
      : "";
    editor.chain().focus().setImage({ src, alt }).run();
    if (!usedDataUrl) {
      updateUploadStatus(statusId, {
        phase: "done",
        progress: 100,
        message: alt
          ? "Image uploaded."
          : "Image uploaded. Select it to add alt text.",
      });
    }
    return true;
  } catch (err) {
    updateUploadStatus(statusId, {
      phase: "error",
      message:
        err instanceof Error ? err.message : "Could not process image.",
    });
    await dialogs.alertError(
      err instanceof Error ? err.message : "Could not process image."
    );
    return false;
  }
}

export function firstImageFile(
  files: FileList | File[] | null | undefined
): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}
