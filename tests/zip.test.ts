import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "@/lib/export/zip";

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/** Minimal reader for store-only archives (mirror of the writer format). */
function readZip(bytes: Uint8Array): Map<string, string> {
  const eocd = bytes.length - 22; // no archive comment
  expect(u32(bytes, eocd)).toBe(0x06054b50);
  const count = u16(bytes, eocd + 10);
  let offset = u32(bytes, eocd + 16); // central directory start

  const files = new Map<string, string>();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    expect(u32(bytes, offset)).toBe(0x02014b50);
    const size = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const localOffset = u32(bytes, offset + 42);
    const name = decoder.decode(
      bytes.slice(offset + 46, offset + 46 + nameLength)
    );

    // Local header: fixed 30 bytes + name + extra, then stored data.
    expect(u32(bytes, localOffset)).toBe(0x04034b50);
    const localNameLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + size);
    expect(u32(bytes, localOffset + 14)).toBe(crc32(data)); // stored CRC

    files.set(name, decoder.decode(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard check vector", () => {
    // CRC-32/ISO-HDLC check value for "123456789".
    const data = new TextEncoder().encode("123456789");
    expect(crc32(data)).toBe(0xcbf43926);
  });

  it("returns 0 for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("buildZip", () => {
  it("produces an archive that round-trips paths and contents", () => {
    const encoder = new TextEncoder();
    const zip = buildZip([
      { path: "essays/first.md", data: encoder.encode("# First\n\nHello.") },
      { path: "drafts/idea (2).md", data: encoder.encode("- notes") },
      { path: "empty.md", data: new Uint8Array(0) },
    ]);

    const files = readZip(zip);
    expect(files.size).toBe(3);
    expect(files.get("essays/first.md")).toBe("# First\n\nHello.");
    expect(files.get("drafts/idea (2).md")).toBe("- notes");
    expect(files.get("empty.md")).toBe("");
  });

  it("handles UTF-8 file names", () => {
    const encoder = new TextEncoder();
    const zip = buildZip([
      { path: "ensayos/canción.md", data: encoder.encode("hola") },
    ]);
    const files = readZip(zip);
    expect(files.get("ensayos/canción.md")).toBe("hola");
  });

  it("builds a valid empty archive", () => {
    const zip = buildZip([]);
    expect(readZip(zip).size).toBe(0);
    expect(zip.length).toBe(22); // just the end-of-central-directory record
  });
});
