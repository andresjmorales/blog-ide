/** Download the essay as a `.md` file. */
export function downloadMarkdown(markdown: string, fileName: string): void {
  const safe = (fileName || "essay.md").replace(/[\\/:*?"<>|]+/g, "-");
  const name = safe.toLowerCase().endsWith(".md") ? safe : `${safe}.md`;
  const blob = new Blob([markdown], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Copy the essay markdown (plain text only). */
export async function copyMarkdownToClipboard(markdown: string): Promise<void> {
  await navigator.clipboard.writeText(markdown);
}

/** Copy markdown + HTML for pasting into a rich editor (Substack / Medium / Docs). */
export async function copyDocumentForPaste(input: {
  markdown: string;
  html: string;
  title?: string;
}): Promise<void> {
  const title = input.title?.trim();
  const html = title
    ? `<h1>${escapeHtml(title)}</h1>\n${input.html}`
    : input.html;

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([input.markdown], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return;
  }

  await navigator.clipboard.writeText(input.markdown);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Read a local `.md` / text file picked by the user. */
export function pickMarkdownFile(): Promise<{
  name: string;
  markdown: string;
} | null> {
  return pickEssayImportFile().then((picked) => {
    if (!picked || picked.kind !== "markdown") return null;
    return { name: picked.name, markdown: picked.markdown };
  });
}

export type PickedEssayImport =
  | { kind: "markdown"; name: string; markdown: string }
  | { kind: "office"; name: string; file: File };

/** Read a local essay import: markdown, or Word/OpenDocument for Pandoc. */
export function pickEssayImportFile(): Promise<PickedEssayImport | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = [
      ".md",
      ".markdown",
      ".txt",
      ".docx",
      ".odt",
      "text/markdown",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text",
    ].join(",");
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".docx") || lower.endsWith(".odt")) {
        resolve({ kind: "office", name: file.name, file });
        return;
      }
      const markdown = await file.text();
      resolve({ kind: "markdown", name: file.name, markdown });
    });
    input.click();
  });
}
