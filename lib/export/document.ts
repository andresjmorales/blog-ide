/** Download the essay as a `.md` file. */
export function downloadMarkdown(markdown: string, fileName: string): void {
  triggerDownload(
    new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    withExt(fileName || "essay.md", ".md")
  );
}

/** Download a standalone HTML document. */
export function downloadHtmlDocument(html: string, fileName: string): void {
  triggerDownload(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    withExt(fileName || "essay.html", ".html")
  );
}

function withExt(fileName: string, ext: string): string {
  const safe = fileName.replace(/[\\/:*?"<>|]+/g, "-");
  return safe.toLowerCase().endsWith(ext) ? safe : `${safe}${ext}`;
}

function triggerDownload(blob: Blob, name: string): void {
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

/**
 * Copy HTML + a readable plain-text fallback for pasting into a rich editor.
 * Do not put markdown source in `plain` for publish targets.
 */
export async function copyDocumentForPaste(input: {
  html: string;
  plain: string;
}): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([input.plain], { type: "text/plain" }),
          "text/html": new Blob([input.html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      /* try contenteditable fallback */
    }
  }
  if (copyViaContentEditable(input.html)) return;
  await navigator.clipboard.writeText(input.plain);
}

function copyViaContentEditable(html: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const div = document.createElement("div");
  div.setAttribute("contenteditable", "true");
  div.innerHTML = html;
  Object.assign(div.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0.01",
  });
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  div.remove();
  return ok;
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
