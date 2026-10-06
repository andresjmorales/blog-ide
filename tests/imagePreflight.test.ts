import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_FILE_BYTES,
  parseImageDimensions,
  preflightImageFile,
} from "@/lib/assets/imagePreflight";

function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** SOI, an APP1 (EXIF-like) segment, then SOF0 with the frame size. */
function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const app1 = [0xff, 0xe1, 0x00, 0x06, 1, 2, 3, 4];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof, ...new Array(12).fill(0)]);
}

function gifHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(13);
  bytes.set([...("GIF89a".split("").map((c) => c.charCodeAt(0)))]);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

function webpVp8xHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(30);
  const ascii = (offset: number, text: string) =>
    bytes.set(text.split("").map((c) => c.charCodeAt(0)), offset);
  ascii(0, "RIFF");
  ascii(8, "WEBP");
  ascii(12, "VP8X");
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return bytes;
}

describe("parseImageDimensions", () => {
  it("reads PNG, JPEG, GIF, and WebP headers", () => {
    expect(parseImageDimensions(pngHeader(6000, 9000))).toEqual({ width: 6000, height: 9000 });
    expect(parseImageDimensions(jpegHeader(6000, 9000))).toEqual({ width: 6000, height: 9000 });
    expect(parseImageDimensions(gifHeader(320, 240))).toEqual({ width: 320, height: 240 });
    expect(parseImageDimensions(webpVp8xHeader(4000, 3000))).toEqual({ width: 4000, height: 3000 });
  });

  it("returns null for unknown formats", () => {
    expect(parseImageDimensions(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });
});

describe("preflightImageFile", () => {
  it("accepts a large-but-workable photo and reports its size", async () => {
    const file = new File([pngHeader(6000, 9000)], "big.png", { type: "image/png" });
    await expect(preflightImageFile(file)).resolves.toEqual({
      ok: true,
      dimensions: { width: 6000, height: 9000 },
    });
  });

  it("rejects images with too many pixels before decoding", async () => {
    const file = new File([jpegHeader(20000, 20000)], "huge.jpg", { type: "image/jpeg" });
    const result = await preflightImageFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/20000×20000/);
  });

  it("rejects files over the byte limit", async () => {
    const file = new File([pngHeader(10, 10)], "x.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: MAX_IMAGE_FILE_BYTES + 1 });
    const result = await preflightImageFile(file);
    expect(result.ok).toBe(false);
  });

  it("rejects non-images", async () => {
    const file = new File(["hi"], "a.txt", { type: "text/plain" });
    expect((await preflightImageFile(file)).ok).toBe(false);
  });
});
