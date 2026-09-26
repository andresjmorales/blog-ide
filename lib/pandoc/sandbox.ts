import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readBodyCapped, safePublicFetch } from "@/lib/preview/ssrf";

/**
 * Pandoc and the LaTeX engines happily read local files: `![](/etc/passwd)`,
 * raw `\input{…}`, or `$\input{…}$` math (passed to LaTeX verbatim) would
 * embed server files — including /proc/self/environ and its secrets — into
 * the exported document. Pandoc would also fetch any image URL itself,
 * including private addresses. The helpers here close both:
 *
 * 1. Remote images are downloaded by us through the SSRF-checked fetcher and
 *    rewritten to files in the job's temp dir.
 * 2. A Lua filter drops every other image and all raw TeX / risky raw HTML,
 *    so pandoc never reads or fetches anything else.
 * 3. PDF engines run with kpathsea's paranoid file access (no absolute paths
 *    or `..`) and shell escape off, which also covers math.
 */

const IMAGE_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_IMAGES = 60;

/** Only files named like this (written by us) survive the filter. */
const LOCAL_IMAGE_NAME = /^img-\d+\.(png|jpe?g|gif|webp|svg)$/;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export const PANDOC_HARDEN_FILTER = `
local function allowed(src)
  return src:match("^img%-%d+%.%a+$") ~= nil
end

function Image(el)
  if allowed(el.src) then return nil end
  return el.caption
end

local risky_html = { "file:", "src", "href", "url(", "@import", "<link",
  "<style", "<iframe", "<object", "<embed", "<script" }

local function drop_raw(el)
  local format = el.format:lower()
  if format:match("tex") then return {} end
  if format == "html" or format == "html5" then
    local text = el.text:lower()
    for _, needle in ipairs(risky_html) do
      if text:find(needle, 1, true) then return {} end
    end
  end
  return nil
end

RawInline = drop_raw
RawBlock = drop_raw
`;

/** Environment for pandoc runs that invoke a TeX engine. */
export function paranoidTexEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    openin_any: "p",
    openout_any: "p",
    shell_escape: "f",
  };
}

// ![alt](<url> "title") / ![alt](url "title")
const IMAGE_REF = /(!\[[^\]]*\]\()\s*(<[^>\n]+>|[^)\s]+)((?:\s+(?:"[^"]*"|'[^']*'))?\s*\))/g;

async function downloadImage(
  url: string,
  budget: { remaining: number }
): Promise<{ bytes: Uint8Array; ext: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await safePublicFetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/*" },
    });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const type = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const ext = EXT_BY_TYPE[type];
    if (!ext) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const cap = Math.min(MAX_IMAGE_BYTES, budget.remaining);
    const bytes = await readBodyCapped(response, cap + 1);
    if (bytes.byteLength > cap) return null;
    budget.remaining -= bytes.byteLength;
    return { bytes, ext };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download the essay's http(s) images into `dir` and point the markdown at
 * them. Images that fail (private host, not an image, too large) are left
 * as-is and then dropped by the filter, so the export still succeeds.
 */
export async function localizeRemoteImages(
  markdown: string,
  dir: string
): Promise<string> {
  const urls: string[] = [];
  for (const match of markdown.matchAll(IMAGE_REF)) {
    const url = match[2].replace(/^<|>$/g, "");
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    if (urls.length >= MAX_IMAGES) break;
  }
  if (urls.length === 0) return markdown;

  const budget = { remaining: MAX_TOTAL_IMAGE_BYTES };
  const local = new Map<string, string>();
  // Sequential keeps the byte budget honest and the fan-out polite.
  for (const [index, url] of urls.entries()) {
    const image = await downloadImage(url, budget);
    if (!image) continue;
    const name = `img-${index + 1}.${image.ext}`;
    if (!LOCAL_IMAGE_NAME.test(name)) continue;
    await writeFile(join(dir, name), image.bytes);
    local.set(url, name);
  }

  return markdown.replace(IMAGE_REF, (whole, open: string, dest: string, rest: string) => {
    const name = local.get(dest.replace(/^<|>$/g, ""));
    return name ? `${open}${name}${rest}` : whole;
  });
}
