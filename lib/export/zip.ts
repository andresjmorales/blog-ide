/**
 * Minimal ZIP writer (store method, no compression) — enough to bundle a
 * workspace of markdown files without pulling in a dependency. Filenames
 * are UTF-8 (general-purpose bit 11).
 */

export type ZipEntry = {
  /** Forward-slash path inside the archive, e.g. "essays/my-essay.md". */
  path: string;
  data: Uint8Array;
  /** Entry mtime; defaults to now. */
  modified?: Date;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date:
      ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  bytes(data: Uint8Array) {
    this.chunks.push(data);
    this.length += data.length;
  }

  u16(value: number) {
    this.bytes(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number) {
    this.bytes(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ])
    );
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/** Build a store-only (uncompressed) ZIP archive. */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const writer = new ByteWriter();
  const encoder = new TextEncoder();
  const central: {
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    offset: number;
    time: number;
    date: number;
  }[] = [];

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const { time, date } = dosDateTime(entry.modified ?? new Date());
    const offset = writer.length;

    writer.u32(0x04034b50); // local file header signature
    writer.u16(20); // version needed
    writer.u16(0x0800); // flags: UTF-8 names
    writer.u16(0); // method: store
    writer.u16(time);
    writer.u16(date);
    writer.u32(crc);
    writer.u32(entry.data.length); // compressed size (== raw for store)
    writer.u32(entry.data.length);
    writer.u16(nameBytes.length);
    writer.u16(0); // extra length
    writer.bytes(nameBytes);
    writer.bytes(entry.data);

    central.push({ nameBytes, crc, size: entry.data.length, offset, time, date });
  }

  const centralStart = writer.length;
  for (const item of central) {
    writer.u32(0x02014b50); // central directory signature
    writer.u16(20); // version made by
    writer.u16(20); // version needed
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(item.time);
    writer.u16(item.date);
    writer.u32(item.crc);
    writer.u32(item.size);
    writer.u32(item.size);
    writer.u16(item.nameBytes.length);
    writer.u16(0); // extra
    writer.u16(0); // comment
    writer.u16(0); // disk number
    writer.u16(0); // internal attrs
    writer.u32(0); // external attrs
    writer.u32(item.offset);
    writer.bytes(item.nameBytes);
  }
  const centralSize = writer.length - centralStart;

  writer.u32(0x06054b50); // end of central directory
  writer.u16(0); // disk
  writer.u16(0); // start disk
  writer.u16(central.length);
  writer.u16(central.length);
  writer.u32(centralSize);
  writer.u32(centralStart);
  writer.u16(0); // comment length

  return writer.concat();
}
