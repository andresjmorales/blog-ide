/** Client-side resize/compress before insert or upload. */

const MAX_WIDTH = 1600;
const TARGET_BYTES = 500_000;

export async function compressImageFile(file: File): Promise<{
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const tryWebp = await canvasToBlob(canvas, "image/webp", 0.82);
  if (tryWebp && tryWebp.size <= TARGET_BYTES) {
    return { blob: tryWebp, mime: "image/webp", width, height };
  }

  let quality = 0.85;
  let jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
  while (jpeg && jpeg.size > TARGET_BYTES && quality > 0.45) {
    quality -= 0.1;
    jpeg = await canvasToBlob(canvas, "image/jpeg", quality);
  }
  if (!jpeg) throw new Error("Could not encode image");
  return { blob: jpeg, mime: "image/jpeg", width, height };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
    });
    input.click();
  });
}

export function pickPdfFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
    });
    input.click();
  });
}
