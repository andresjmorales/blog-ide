import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  getPandocPath,
  getPandocPdfEnginePref,
  PANDOC_MARKDOWN_FROM,
  PANDOC_MARKDOWN_TO,
  PANDOC_PDF_ENGINES,
} from "@/lib/pandoc/config";
import {
  localizeRemoteImages,
  PANDOC_HARDEN_FILTER,
  paranoidTexEnv,
} from "@/lib/pandoc/sandbox";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 45_000;
const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
/** Raw TeX in essays would reach the PDF engine verbatim. */
const EXPORT_MARKDOWN_FROM = `${PANDOC_MARKDOWN_FROM}-raw_tex`;
const FILTER_NAME = "blogide-harden.lua";

/**
 * Write the essay (with remote images localized) and the hardening filter
 * into `dir`. Pandoc then runs with `cwd: dir`, so the only readable
 * resources are the ones written here. See lib/pandoc/sandbox.ts.
 */
async function prepareExportDir(dir: string, markdown: string) {
  const input = join(dir, "essay.md");
  const filter = join(dir, FILTER_NAME);
  await writeFile(input, await localizeRemoteImages(markdown, dir), "utf8");
  await writeFile(filter, PANDOC_HARDEN_FILTER, "utf8");
  return { input, filter };
}

export class PandocUnavailableError extends Error {
  constructor() {
    super(
      "Word export needs Pandoc on the server. Set PANDOC_PATH (for example /usr/bin/pandoc) and restart."
    );
    this.name = "PandocUnavailableError";
  }
}

export class PandocPdfEngineError extends Error {
  constructor() {
    super(
      "PDF via Pandoc needs a PDF engine (xelatex, pdflatex, weasyprint, or typst). Install one, set PANDOC_PDF_ENGINE, or use Export → PDF (print) to save from the browser."
    );
    this.name = "PandocPdfEngineError";
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
  const output = join(dir, "essay.docx");
  try {
    const { input, filter } = await prepareExportDir(dir, markdown);
    await execFileAsync(
      pandoc,
      [
        `--from=${EXPORT_MARKDOWN_FROM}`,
        "--to=docx",
        "--wrap=none",
        `--lua-filter=${filter}`,
        `--output=${output}`,
        input,
      ],
      { cwd: dir, timeout: TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }
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

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(cmd, ["--version"], { timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

export async function resolvePandocPdfEngine(): Promise<string | null> {
  const preferred = getPandocPdfEnginePref();
  if (preferred) {
    if (await commandExists(preferred)) return preferred;
    return null;
  }
  for (const engine of PANDOC_PDF_ENGINES) {
    if (await commandExists(engine)) return engine;
  }
  return null;
}

export async function markdownToPdf(markdown: string): Promise<Buffer> {
  const pandoc = await assertPandocAvailable();
  const engine = await resolvePandocPdfEngine();
  if (!engine) throw new PandocPdfEngineError();

  const bytes = Buffer.byteLength(markdown, "utf8");
  if (bytes > MAX_MARKDOWN_BYTES) {
    throw new Error("Essay is too large to convert (2 MiB markdown limit).");
  }

  const dir = await mkdtemp(join(tmpdir(), "blogide-pandoc-pdf-"));
  const output = join(dir, "essay.pdf");
  try {
    const { input, filter } = await prepareExportDir(dir, markdown);
    await execFileAsync(
      pandoc,
      [
        `--from=${EXPORT_MARKDOWN_FROM}`,
        "--to=pdf",
        `--pdf-engine=${engine}`,
        "--wrap=none",
        `--lua-filter=${filter}`,
        `--output=${output}`,
        input,
      ],
      {
        cwd: dir,
        env: paranoidTexEnv(),
        timeout: 90_000,
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    return await readFile(output);
  } catch (error) {
    if (
      error instanceof PandocUnavailableError ||
      error instanceof PandocPdfEngineError
    ) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Pandoc PDF conversion failed.";
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
