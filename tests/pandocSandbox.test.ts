import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localizeRemoteImages,
  PANDOC_HARDEN_FILTER,
} from "@/lib/pandoc/sandbox";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function hasPandoc(): boolean {
  try {
    execFileSync("pandoc", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

let dir: string | null = null;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("localizeRemoteImages", () => {
  it("downloads public images and rewrites them to local files", async () => {
    dir = await mkdtemp(join(tmpdir(), "blogide-test-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(PNG, { headers: { "content-type": "image/png" } })
      )
    );
    const out = await localizeRemoteImages(
      'A ![one](https://93.184.216.34/a.png "cap") and ![two](</etc/passwd>).',
      dir
    );
    expect(out).toBe('A ![one](img-1.png "cap") and ![two](</etc/passwd>).');
    expect(await readdir(dir)).toEqual(["img-1.png"]);
  });

  it("never requests private hosts", async () => {
    dir = await mkdtemp(join(tmpdir(), "blogide-test-"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const md = "![x](http://169.254.169.254/latest/meta-data)";
    expect(await localizeRemoteImages(md, dir)).toBe(md);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips responses that are not images", async () => {
    dir = await mkdtemp(join(tmpdir(), "blogide-test-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>", { headers: { "content-type": "text/html" } })
      )
    );
    const md = "![x](https://93.184.216.34/page)";
    expect(await localizeRemoteImages(md, dir)).toBe(md);
  });
});

describe.skipIf(!hasPandoc())("PANDOC_HARDEN_FILTER", () => {
  it("drops local-file images and raw TeX / risky HTML", async () => {
    dir = await mkdtemp(join(tmpdir(), "blogide-test-"));
    const filter = join(dir, "f.lua");
    const input = join(dir, "in.md");
    await writeFile(filter, PANDOC_HARDEN_FILTER);
    await writeFile(
      input,
      [
        "![leak](/etc/passwd) ![rel](secret.png) ![ok](img-1.png)",
        "",
        "`\\input{/etc/hostname}`{=latex}",
        "",
        '<img src="file:///etc/passwd"> <sup>2</sup>',
      ].join("\n")
    );
    const native = execFileSync(
      "pandoc",
      [
        "--from=markdown+raw_html-raw_tex",
        "--to=native",
        `--lua-filter=${filter}`,
        input,
      ],
      { encoding: "utf8" }
    );
    expect(native).not.toContain("/etc/passwd");
    expect(native).not.toContain("secret.png");
    expect(native).not.toContain("RawInline (Format \"latex\")");
    expect(native).toContain("img-1.png");
    expect(native).toContain("<sup>");
  });
});
