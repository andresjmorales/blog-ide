/**
 * Readable plain-text fallback for a rich-text clipboard payload.
 * Publish copies must not put markdown source in text/plain: several
 * editors (including Substack) will paste that instead of the HTML.
 */

export function htmlToPlainText(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    "text/html"
  );
  const root = doc.getElementById("root");
  if (!root) return "";
  return blocksToPlain(root).replace(/\n{3,}/g, "\n\n").trim();
}

function blocksToPlain(root: Element): string {
  const parts: string[] = [];

  function walk(node: Node, inPre: boolean): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      parts.push(inPre ? text : text.replace(/\s+/g, " "));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return;
    if (tag === "br") {
      parts.push("\n");
      return;
    }
    const block = /^(p|div|h[1-6]|li|tr|blockquote|pre|section|ol|ul|table|figure)$/.test(
      tag
    );
    if (block && parts.length && !parts[parts.length - 1]?.endsWith("\n")) {
      parts.push("\n");
    }
    if (tag === "li") parts.push("");
    for (const child of node.childNodes) walk(child, inPre || tag === "pre");
    if (block) parts.push("\n");
  }

  walk(root, false);
  return parts.join("").replace(/[ \t]+\n/g, "\n");
}
