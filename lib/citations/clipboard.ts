export function citeCopyToastMessage(id: string): string {
  if (id === "works-cited") return "Copied bibliography.";
  if (id.endsWith(":url")) return "Copied URL.";
  if (id.endsWith(":bib") || id.startsWith("used-bib:")) return "Copied BibTeX.";
  return "Copied citation.";
}

export async function copyPlainText(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand.
    }
  }
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
