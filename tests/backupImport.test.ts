import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  BACKUP_MANIFEST_PATH,
  emptyBackupManifest,
  parseBackupManifest,
} from "@/lib/export/backupManifest";
import {
  backupCopyName,
  bundledAssetPaths,
  planBackupImport,
  readBackupArchive,
  relinkBundledAssets,
} from "@/lib/export/backupImportPlan";
import { readZip } from "@/lib/export/unzip";
import { buildZip } from "@/lib/export/zip";
import { absolutizeSiteRelativeMarkdown } from "@/lib/siteRelative";

const encoder = new TextEncoder();
const USER = "11111111-2222-3333-4444-555555555555";
const SIGNED = `https://proj.supabase.co/storage/v1/object/sign/assets/${USER}/1700-cover.webp?token=abc`;

function file(path: string, text: string) {
  return { path, data: encoder.encode(text) };
}

describe("readZip", () => {
  it("reads back what buildZip writes", async () => {
    const zip = buildZip([file("a.md", "# A"), file("Folder/b.md", "é")]);
    const entries = await readZip(zip);
    expect(entries.map((e) => e.path)).toEqual(["a.md", "Folder/b.md"]);
    expect(new TextDecoder().decode(entries[1].data)).toBe("é");
  });

  it("inflates deflated entries", async () => {
    const zip = buildZip([file("a.md", "hello hello hello")]);
    // Turn the stored entry into a deflated one, as an OS zipper would.
    const raw = new Uint8Array(deflateRawSync(Buffer.from("hello hello hello")));
    const name = encoder.encode("a.md");
    const local = new Uint8Array(30 + name.length + raw.length);
    local.set(zip.subarray(0, 30 + name.length));
    local.set(raw, 30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint16(8, 8, true);
    view.setUint32(18, raw.length, true);
    const centralStart = 30 + name.length + "hello hello hello".length;
    const central = zip.slice(centralStart);
    const cview = new DataView(central.buffer);
    cview.setUint16(10, 8, true);
    cview.setUint32(20, raw.length, true);
    const eocd = central.length - 22;
    cview.setUint32(eocd + 16, local.length, true);
    const out = new Uint8Array(local.length + central.length);
    out.set(local);
    out.set(central, local.length);
    const entries = await readZip(out);
    expect(new TextDecoder().decode(entries[0].data)).toBe("hello hello hello");
  });

  it("rejects a file that is not a zip", async () => {
    await expect(readZip(encoder.encode("nope"))).rejects.toThrow(/not a .zip/);
  });
});

describe("backup import planning", () => {
  const stored = `---\ntitle: Ordo\n---\n![Rembrandt (1638)](/writing/ordo/1-image.webp)\n\n![cover](${SIGNED})\n`;

  function exportedArchive(markdown: string) {
    const manifest = emptyBackupManifest(new Date("2026-10-15T12:00:00Z"));
    manifest.assets["assets/1700-cover.webp"] = `${USER}/1700-cover.webp`;
    manifest.documents["Essays/ordo.md"] = {
      siteUrl: "https://example.com",
      sitePaths: ["/writing/ordo/1-image.webp"],
    };
    const bundled = markdown.replace(SIGNED, "assets/1700-cover.webp");
    return [
      file("Essays/ordo.md", absolutizeSiteRelativeMarkdown(bundled, "example.com")),
      file("assets/1700-cover.webp", "img"),
      file(BACKUP_MANIFEST_PATH, JSON.stringify(manifest)),
    ];
  }

  it("restores site-relative paths and skips an unchanged essay", () => {
    const archive = readBackupArchive(exportedArchive(stored), parseBackupManifest);
    expect(archive.documents[0].markdown).toContain("https://example.com/writing/ordo");
    const plan = planBackupImport(archive, new Map([["essays/ordo.md", stored]]), USER);
    expect(plan[0].action).toBe("unchanged");
    expect(plan[0].markdown).toContain("](/writing/ordo/1-image.webp)");
    expect(plan[0].markdown).toContain("](assets/1700-cover.webp)");
  });

  it("treats a re-signed image URL as unchanged", () => {
    const archive = readBackupArchive(exportedArchive(stored), parseBackupManifest);
    const resigned = stored.replace("token=abc", "token=xyz");
    const plan = planBackupImport(archive, new Map([["essays/ordo.md", resigned]]), USER);
    expect(plan[0].action).toBe("unchanged");
  });

  it("copies an essay that changed and creates a missing one", () => {
    const archive = readBackupArchive(exportedArchive(stored), parseBackupManifest);
    expect(planBackupImport(archive, new Map([["essays/ordo.md", stored + "More.\n"]]), USER)[0].action).toBe("copy");
    expect(planBackupImport(archive, new Map(), USER)[0].action).toBe("create");
  });

  it("strips a wrapping folder from a re-zipped export", () => {
    const archive = readBackupArchive(
      [file("blogide-export-2026-10-15/a.md", "A"), file("blogide-export-2026-10-15/F/b.md", "B")],
      parseBackupManifest
    );
    expect(archive.documents.map((d) => d.path)).toEqual(["a.md", "F/b.md"]);
    expect(archive.manifest).toBeNull();
  });

  it("ignores OS clutter", () => {
    const archive = readBackupArchive(
      [file("__MACOSX/._a.md", "x"), file(".hidden.md", "x"), file("a.md", "A")],
      parseBackupManifest
    );
    expect(archive.documents.map((d) => d.path)).toEqual(["a.md"]);
  });

  it("relinks bundled images and names copies", () => {
    const md = "![c](assets/x.webp) [l](assets/x.webp) ![d](assets/y.png)";
    expect(bundledAssetPaths(md)).toEqual(["assets/x.webp", "assets/y.png"]);
    expect(relinkBundledAssets(md, new Map([["assets/x.webp", "https://u"]]))).toBe(
      "![c](https://u) [l](https://u) ![d](assets/y.png)"
    );
    expect(backupCopyName("ordo.md", "2026-10-15T12:00:00Z")).toBe("ordo (backup 2026-10-15).md");
    expect(backupCopyName("ordo.md", "")).toBe("ordo (backup).md");
  });
});
