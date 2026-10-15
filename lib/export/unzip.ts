/**
 * Minimal ZIP reader for backups: stored entries (what `buildZip` writes)
 * and deflated ones (an archive re-zipped by the OS), via the browser's
 * DecompressionStream. Directories, encrypted entries and ZIP64 are not
 * supported.
 */

export type UnzippedEntry = {
  /** Forward-slash path inside the archive. */
  path: string;
  data: Uint8Array;
};

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8);
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
  );
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  // The record is 22 bytes plus a comment of up to 65535 bytes.
  const stop = Math.max(0, bytes.length - 22 - 0xffff);
  for (let at = bytes.length - 22; at >= stop; at--) {
    if (u32(bytes, at) === 0x06054b50) return at;
  }
  return -1;
}

/** Read every file entry of a ZIP archive. Throws on anything unreadable. */
export async function readZip(bytes: Uint8Array): Promise<UnzippedEntry[]> {
  const end = findEndOfCentralDirectory(bytes);
  if (end < 0) throw new Error("That file is not a .zip archive.");
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  const decoder = new TextDecoder();
  const entries: UnzippedEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error("The .zip archive is damaged.");
    const flags = u16(bytes, at + 8);
    const method = u16(bytes, at + 10);
    const compressedSize = u32(bytes, at + 20);
    const nameLength = u16(bytes, at + 28);
    const extraLength = u16(bytes, at + 30);
    const commentLength = u16(bytes, at + 32);
    const localOffset = u32(bytes, at + 42);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    if (path.endsWith("/")) continue;
    if (flags & 1) throw new Error("Encrypted .zip archives are not supported.");
    if (u32(bytes, localOffset) !== 0x04034b50) throw new Error("The .zip archive is damaged.");
    const dataStart =
      localOffset + 30 + u16(bytes, localOffset + 26) + u16(bytes, localOffset + 28);
    const raw = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) {
      entries.push({ path, data: raw.slice() });
    } else if (method === 8) {
      entries.push({ path, data: await inflateRaw(raw) });
    } else {
      throw new Error(`Unsupported compression in the .zip archive (${path}).`);
    }
  }
  return entries;
}
