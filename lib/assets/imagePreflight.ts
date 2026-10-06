/**
 * Cheap checks run before an image is decoded, compressed, or uploaded, so a
 * huge or unreadable file fails fast with a clear message instead of hanging
 * the editor (and never reaches the markdown / sync path).
 */

/** Largest file we will try to read (pasted photos arrive as big PNGs). */
export const MAX_IMAGE_FILE_BYTES = 200 * 1024 * 1024;
/** Decoding beyond this risks running the tab out of memory (RGBA = 4 B/px). */
export const MAX_IMAGE_PIXELS = 120_000_000;

/** JPEG EXIF / ICC blocks can push the frame header well past the first KB. */
const HEADER_BYTES = 512 * 1024;

export type ImageDimensions = { width: number; height: number };

export type ImagePreflight =
  | { ok: true; dimensions: ImageDimensions | null }
  | { ok: false; message: string };

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatMegapixels(pixels: number): string {
  return `${Math.round(pixels / 1_000_000)} MP`;
}

/**
 * Width/height from the file header (PNG, GIF, WebP, JPEG). Null for other
 * formats or unrecognized headers — the decoder is then the only check.
 */
export async function readImageDimensions(
  file: Blob
): Promise<ImageDimensions | null> {
  const bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  return parseImageDimensions(bytes);
}

export function parseImageDimensions(
  bytes: Uint8Array
): ImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  // PNG: signature, then IHDR width/height (big-endian).
  if (bytes.length >= 24 && ascii(1, 3) === "PNG" && ascii(12, 4) === "IHDR") {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: logical screen size (little-endian).
  if (bytes.length >= 10 && ascii(0, 3) === "GIF") {
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }

  // WebP: RIFF container with VP8 / VP8L / VP8X first chunk.
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") {
      const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
      const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
      return { width, height };
    }
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 ") {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    return null;
  }

  // JPEG: walk segments to the first start-of-frame marker.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1]!;
      // Fill bytes / standalone markers carry no length.
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isStartOfFrame) {
        return {
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
    return null;
  }

  return null;
}

/** Reject files that would hang or crash the tab before doing any heavy work. */
export async function preflightImageFile(file: File): Promise<ImagePreflight> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "That file isn't an image." };
  }
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    return {
      ok: false,
      message: `This image is ${formatMegabytes(file.size)}, over the ${formatMegabytes(MAX_IMAGE_FILE_BYTES)} limit. Export a smaller copy and try again.`,
    };
  }

  let dimensions: ImageDimensions | null = null;
  try {
    dimensions = await readImageDimensions(file);
  } catch {
    // Unreadable header: let the decoder decide.
  }

  if (dimensions) {
    const pixels = dimensions.width * dimensions.height;
    if (pixels > MAX_IMAGE_PIXELS) {
      return {
        ok: false,
        message: `This image is ${dimensions.width}×${dimensions.height} (${formatMegapixels(pixels)}), too large to process in the browser (limit ${formatMegapixels(MAX_IMAGE_PIXELS)}). Resize it and try again.`,
      };
    }
  }

  return { ok: true, dimensions };
}
