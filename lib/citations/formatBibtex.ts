/**
 * Thin BibTeX → plain-text citation formatter (article / book / misc).
 * Not a full CSL engine — enough for paste-a-entry → insert at caret.
 */

export type CitationStyle = "chicago" | "mla";

export type BibEntry = {
  type: string;
  key: string;
  fields: Record<string, string>;
};

const ENTRY_RE =
  /@(\w+)\s*\{\s*([^,]+)\s*,([\s\S]*?)\n\s*\}/g;

const FIELD_RE = /(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)")/g;

export function parseBibtex(source: string): BibEntry[] {
  const entries: BibEntry[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(ENTRY_RE.source, "g");
  while ((m = re.exec(source)) !== null) {
    const type = m[1].toLowerCase();
    const key = m[2].trim();
    const body = m[3];
    const fields: Record<string, string> = {};
    let f: RegExpExecArray | null;
    const fieldRe = new RegExp(FIELD_RE.source, "g");
    while ((f = fieldRe.exec(body)) !== null) {
      fields[f[1].toLowerCase()] = (f[2] ?? f[3] ?? "").trim();
    }
    entries.push({ type, key, fields });
  }
  return entries;
}

function authorsChicago(raw: string): string {
  const names = raw.split(/\s+and\s+/i).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return "";
  const formatted = names.map((name, i) => {
    const parts = name.split(",").map((p) => p.trim());
    if (parts.length >= 2) {
      // "Last, First" → keep for first author; others "First Last"
      if (i === 0) return `${parts[0]}, ${parts.slice(1).join(" ")}`;
      return `${parts.slice(1).join(" ")} ${parts[0]}`.trim();
    }
    return name;
  });
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]}, and ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]}`;
}

function authorsMla(raw: string): string {
  const names = raw.split(/\s+and\s+/i).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return "";
  const first = names[0];
  const parts = first.split(",").map((p) => p.trim());
  const firstFmt =
    parts.length >= 2 ? `${parts[0]}, ${parts.slice(1).join(" ")}` : first;
  if (names.length === 1) return firstFmt;
  if (names.length === 2) {
    const second = names[1].includes(",")
      ? names[1]
          .split(",")
          .map((p) => p.trim())
          .reverse()
          .join(" ")
      : names[1];
    return `${firstFmt}, and ${second}`;
  }
  return `${firstFmt}, et al.`;
}

function italicize(title: string): string {
  return `*${title}*`;
}

export function formatBibEntry(
  entry: BibEntry,
  style: CitationStyle
): string {
  const f = entry.fields;
  const title = f.title ?? "Untitled";
  const year = f.year ?? f.date ?? "";
  const authorRaw = f.author ?? f.editor ?? "";

  if (style === "mla") {
    const author = authorsMla(authorRaw);
    const container = f.journal ?? f.booktitle ?? f.publisher ?? "";
    const pages = f.pages ? `, pp. ${f.pages.replace(/-/g, "–")}` : "";
    const parts = [
      author ? `${author}.` : null,
      `"${title}."`,
      container ? italicize(container) : null,
      year || null,
      pages ? pages.replace(/^, /, "") : null,
    ].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  // Chicago notes/bibliography-ish plain text
  const author = authorsChicago(authorRaw);
  if (entry.type === "book") {
    const place = f.address ?? f.location ?? "";
    const publisher = f.publisher ?? "";
    const pub = [place, publisher].filter(Boolean).join(": ");
    return [author ? `${author}.` : null, italicize(title), pub, year]
      .filter(Boolean)
      .join(". ")
      .replace(/\.\./g, ".")
      .trim();
  }

  const journal = f.journal ? italicize(f.journal) : "";
  const vol = f.volume ? ` ${f.volume}` : "";
  const num = f.number ? `, no. ${f.number}` : "";
  const pages = f.pages ? `: ${f.pages.replace(/-/g, "–")}` : "";
  return [
    author ? `${author}.` : null,
    `"${title}."`,
    journal ? `${journal}${vol}${num}` : null,
    year ? `(${year})${pages}` : pages || null,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatBibtexSource(
  source: string,
  style: CitationStyle
): string[] {
  return parseBibtex(source).map((entry) => formatBibEntry(entry, style));
}
