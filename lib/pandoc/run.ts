import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  getPandocPath,
  PANDOC_MARKDOWN_FROM,
  PANDOC_MARKDOWN_TO,
} from "@/lib/pandoc/config";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 45_000;
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export class PandocUnavailableError extends Error {
  constructor() {
    super(
      "Word export needs Pandoc on the server. Set PANDOC_PATH (for example /usr/bin/pandoc) and restart."
    );
    this.name = "PandocUnavailableError";
  }
}

export async function assertPandocAvailable(): Promise<string> {
  const path = getPandocPath();
  if (!path) throw new PandocUnavailableError();
  try {
    await execFileAsync(path, ["-v"], { timeout: 8_000 });
  } catch {
    throw new PandocUnavailableError();
  }
  return path;
}

export async function markdownToDocx(markdown: string): Promise<Buffer> {
  const pandoc = await assertPandocAvailable();
  const bytes = Buffer.byteLength(markdown, "utf8");
  if (bytes > MAX_MARKDOWN_BYTES) {
    throw new Error("Essay is too large to convert (2 MiB markdown limit).");
  }

  const dir = await mkdtemp(join(tmpdir(), "blogide-pandoc-"));
  const input = join(dir, "essay.md");
  const output = join(dir, "essay.docx");
  try {
    await writeFile(input, markdown, "utf8");
    await execFileAsync(
      pandoc,
      [
        `--from=${PANDOC_MARKDOWN_FROM}`,
        "--to=docx",
        "--wrap=none",
        `--output=${output}`,
        input,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }
    );
    return await readFile(output);
  } catch (error) {
    if (error instanceof PandocUnavailableError) throw error;
    const message =
      error instanceof Error ? error.message : "Pandoc conversion failed.";
    throw new Error(message.replace(dir, "…"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type PandocImportFormat = "docx" | "odt";

export async function documentToMarkdown(
  data: Buffer,
  format: PandocImportFormat
): Promise<string> {
  const pandoc = await assertPandocAvailable();
  if (data.byteLength > MAX_IMPORT_BYTES) {
    throw new Error("That file is too large to import (8 MiB limit).");
  }

  const dir = await mkdtemp(join(tmpdir(), "blogide-pandoc-in-"));
  const input = join(dir, `source.${format}`);
  try {
    await writeFile(input, data);
    const { stdout } = await execFileAsync(
      pandoc,
      [
        `--from=${format}`,
        `--to=${PANDOC_MARKDOWN_TO}`,
        "--wrap=none",
        input,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" }
    );
    return String(stdout).replace(/^\uFEFF/, "");
  } catch (error) {
    if (error instanceof PandocUnavailableError) throw error;
    const message =
      error instanceof Error ? error.message : "Pandoc import failed.";
    throw new Error(message.replace(dir, "…"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function inferPandocImportFormat(
  fileName: string,
  mime?: string | null
): PandocImportFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx") || mime?.includes("wordprocessingml")) {
    return "docx";
  }
  if (lower.endsWith(".odt") || mime?.includes("opendocument.text")) {
    return "odt";
  }
  return null;
}
