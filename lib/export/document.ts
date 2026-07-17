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

/** Copy markdown + HTML for pasting into Substack / Docs / etc. */
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
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/markdown,text/plain";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const markdown = await file.text();
      resolve({ name: file.name, markdown });
    });
    input.click();
  });
}
