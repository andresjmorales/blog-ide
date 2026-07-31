/**
 * Shared compress → upload → setImage path for toolbar, paste, and drop.
 */
import type { Editor } from "@tiptap/core";
import { compressImageFile } from "@/lib/assets/imagePipeline";
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
  promptAlt: () => Promise<string | null>;
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
  try {
    const compressed = await compressImageFile(file);
    let src: string;
    try {
      const ext = compressed.mime === "image/webp" ? "webp" : "jpg";
      src = await uploadUserAsset(
        compressed.blob,
        file.name.replace(/\.\w+$/, "") + `.${ext}`,
        { kind: "essay_image" }
      );
    } catch (uploadErr) {
      if (uploadErr instanceof QuotaExceededError) {
        await dialogs.alertQuota();
        return false;
      }
      src = await blobToDataUrl(compressed.blob);
    }
    const alt = (await dialogs.promptAlt()) ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
    return true;
  } catch (err) {
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
