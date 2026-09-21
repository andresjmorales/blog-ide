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

/** Local styles. Chicago note is a footnote; author-date styles insert the reference. */
export type LocalCiteStyle =
  | "chicago-note"
  | "chicago-author-date"
  | "turabian"
  | "mla"
  | "apa"
  | "harvard"
  | "ieee"
  | "vancouver";

export type FormattedCitation = {
  /** Text to drop into a footnote. */
  footnote: string;
  /** Reference-list form, when it differs from the footnote. */
  bibliography: string;
  /** Parenthetical, for author-date styles. */
  inText?: string;
};

type Person = { first: string; last: string; literal?: string };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatForLocalStyle(
  entry: BibEntry,
  style: LocalCiteStyle
): FormattedCitation {
  const bibliography = bibliographyFor(entry, style);
  if (style === "chicago-note" || style === "turabian") {
    return { footnote: noteFor(entry), bibliography };
  }
  const inText =
    style === "ieee" || style === "vancouver" ? undefined : inTextFor(entry, style);
  return {
    footnote: bibliography,
    bibliography,
    inText: inText && inText !== bibliography ? inText : undefined,
  };
}

function bibliographyFor(entry: BibEntry, style: LocalCiteStyle): string {
  if (style === "mla") return formatBibEntry(entry, "mla");
  if (style === "apa") return apaReference(entry);
  if (style === "harvard") return harvardReference(entry);
  if (style === "ieee") return ieeeReference(entry);
  if (style === "vancouver") return vancouverReference(entry);
  if (style === "chicago-author-date") return chicagoAuthorDate(entry);
  return chicagoBibliography(entry);
}

function peopleOf(entry: BibEntry): Person[] {
  const raw = entry.fields.author || entry.fields.editor || "";
  return raw
    .split(/\s+and\s+/i)
    .map((name) => name.trim())
    .filter(Boolean)
    .map(parsePerson);
}

function parsePerson(name: string): Person {
  if (name.includes(",")) {
    const [last, ...rest] = name.split(",").map((part) => part.trim());
    return { last, first: rest.join(" ") };
  }
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: "", last: name };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function noteAuthor(people: Person[]): string {
  const names = people.map(displayName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length > 3) return `${names[0]} et al.`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function bibAuthor(people: Person[]): string {
  if (people.length === 0) return "";
  const first = inverted(people[0]);
  if (people.length === 1) return first;
  const rest = people.slice(1).map(displayName);
  if (people.length === 2) return `${first}, and ${rest[0]}`;
  if (people.length > 6) return `${first}, et al.`;
  return `${first}, ${rest.slice(0, -1).join(", ")}, and ${rest[rest.length - 1]}`;
}

function apaAuthor(people: Person[]): string {
  const names = people.map((person) => {
    if (person.literal) return person.literal;
    const given = initials(person.first);
    return given ? `${person.last}, ${given}` : person.last;
  });
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  if (names.length > 20) return `${names[0]}, et al.`;
  return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
}

function harvardAuthor(people: Person[]): string {
  const names = people.map((person) => {
    const given = initials(person.first);
    return given ? `${person.last}, ${given}` : person.last;
  });
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length > 3) return `${names[0]} et al.`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function ieeeAuthor(people: Person[]): string {
  const names = people.map((person) => {
    const given = initials(person.first);
    return given ? `${given} ${person.last}` : person.last;
  });
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length > 6) return `${names[0]} et al.`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function vancouverAuthor(people: Person[]): string {
  const names = people.slice(0, 6).map((person) => {
    const given = (person.first.match(/[A-Za-z]/g) || []).join("");
    return given ? `${person.last} ${given}` : person.last;
  });
  if (people.length > 6) names.push("et al");
  return names.join(", ");
}

function displayName(person: Person): string {
  if (person.literal) return person.literal;
  return [person.first, person.last].filter(Boolean).join(" ");
}

function inverted(person: Person): string {
  if (person.literal) return person.literal;
  if (person.last && person.first) return `${person.last}, ${person.first}`;
  return person.last || person.first;
}

function initials(first: string): string {
  if (!first) return "";
  return first
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part.includes("-")) {
        return part
          .split("-")
          .map((piece) => initialToken(piece))
          .join("-");
      }
      return initialToken(part);
    })
    .join(" ");
}

function initialToken(part: string): string {
  const bare = part.replace(/\./g, "");
  if (!bare) return "";
  if (bare.length === 1) return `${bare.toUpperCase()}.`;
  return `${bare[0].toUpperCase()}.`;
}

function yearOf(entry: BibEntry): string {
  return (entry.fields.year || entry.fields.date || "").match(/\d{4}/)?.[0] || "";
}

function longDate(entry: BibEntry): string {
  const date = entry.fields.date || "";
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const month = MONTHS[Number(iso[2]) - 1];
    if (month) return `${month} ${Number(iso[3])}, ${iso[1]}`;
  }
  if (date && !/^\d{4}$/.test(date)) return date;
  return yearOf(entry);
}

function pagesOf(entry: BibEntry): string {
  return (entry.fields.pages || "").replace(/-+/g, "–");
}

function siteOf(entry: BibEntry): string {
  return entry.fields.howpublished || entry.fields.note || entry.fields.publisher || "";
}

function isPeriodical(entry: BibEntry): boolean {
  return Boolean(entry.fields.journal || entry.fields.booktitle) || entry.type === "article";
}

function finish(value: string): string {
  const text = value.replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").trim();
  if (!text) return "";
  return /[.?!]$/.test(text) ? text : `${text}.`;
}

function noteFor(entry: BibEntry): string {
  const author = noteAuthor(peopleOf(entry));
  const title = entry.fields.title || "Untitled";
  const year = yearOf(entry);
  const date = longDate(entry);
  const url = entry.fields.url || "";
  if (entry.type === "book" || entry.type === "inbook") {
    const place = entry.fields.address || entry.fields.location || "";
    const publisher = entry.fields.publisher || "";
    const pub = [place, publisher].filter(Boolean).join(": ");
    const paren = [pub, year].filter(Boolean).join(", ");
    const head = author ? `${author}, ${italicize(title)}` : italicize(title);
    return finish(paren ? `${head} (${paren})` : head);
  }
  if (isPeriodical(entry) && entry.fields.journal) {
    const vol = entry.fields.volume ? ` ${entry.fields.volume}` : "";
    const num = entry.fields.number ? `, no. ${entry.fields.number}` : "";
    const pages = pagesOf(entry);
    const locator = `${italicize(entry.fields.journal)}${vol}${num}`;
    const when = year ? ` (${year})` : "";
    const pageBit = pages ? `: ${pages}` : "";
    const head = author ? `${author}, "${title},"` : `"${title},"`;
    return finish(`${head} ${locator}${when}${pageBit}`);
  }
  const site = siteOf(entry);
  const quoted = `"${title},"`;
  const head = author ? `${author}, ${quoted}` : quoted;
  const tail = [site ? italicize(site) : "", date, url].filter(Boolean).join(", ");
  return finish(tail ? `${head} ${tail}` : head);
}

function chicagoBibliography(entry: BibEntry): string {
  return formatBibEntry(entry, "chicago");
}

function chicagoAuthorDate(entry: BibEntry): string {
  const author = bibAuthor(peopleOf(entry));
  const year = yearOf(entry);
  const title = entry.fields.title || "Untitled";
  const yearBit = year ? `${year}.` : "";
  if (entry.type === "book") {
    const place = entry.fields.address || entry.fields.location || "";
    const publisher = entry.fields.publisher || "";
    const pub = [place, publisher].filter(Boolean).join(": ");
    const head = [author ? `${author}.` : "", yearBit].filter(Boolean).join(" ");
    return finish([head, italicize(title), pub].filter(Boolean).join(" "));
  }
  if (entry.fields.journal) {
    const vol = entry.fields.volume ? ` ${entry.fields.volume}` : "";
    const num = entry.fields.number ? `, no. ${entry.fields.number}` : "";
    const pages = pagesOf(entry);
    return finish(
      [
        author,
        yearBit,
        `"${title}."`,
        `${italicize(entry.fields.journal)}${vol}${num}${pages ? `: ${pages}` : ""}`,
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
  const site = siteOf(entry);
  const date = longDate(entry);
  return finish(
    [author, yearBit, `"${title}."`, site ? italicize(site) : "", date !== year ? date : "", entry.fields.url]
      .filter(Boolean)
      .join(" ")
  );
}

function apaReference(entry: BibEntry): string {
  const author = apaAuthor(peopleOf(entry));
  const year = yearOf(entry);
  const date = entry.fields.date || "";
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const when = iso
    ? `${iso[1]}, ${MONTHS[Number(iso[2]) - 1]} ${Number(iso[3])}`
    : year;
  const title = entry.fields.title || "Untitled";
  const tail = entry.fields.doi
    ? `https://doi.org/${entry.fields.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")}`
    : entry.fields.url || "";
  if (entry.fields.journal) {
    const vol = entry.fields.volume || "";
    const issue = entry.fields.number ? `(${entry.fields.number})` : "";
    const pages = pagesOf(entry);
    const journal = vol
      ? `${italicize(`${entry.fields.journal}, ${vol}`)}${issue}`
      : `${italicize(entry.fields.journal)}${issue}`;
    return finish(
      [sentence(author), when ? `(${when}).` : "", sentence(title), pages ? `${journal}, ${pages}.` : sentence(journal), tail]
        .filter(Boolean)
        .join(" ")
    );
  }
  const site = siteOf(entry);
  return finish(
    [sentence(author), when ? `(${when}).` : "", sentence(title), site ? sentence(italicize(site)) : "", tail]
      .filter(Boolean)
      .join(" ")
  );
}

function sentence(value: string): string {
  if (!value) return "";
  return /[.?!]$/.test(value) ? value : `${value}.`;
}

function harvardReference(entry: BibEntry): string {
  const author = harvardAuthor(peopleOf(entry));
  const year = yearOf(entry);
  const title = entry.fields.title || "Untitled";
  const head = [author, year ? `(${year})` : ""].filter(Boolean).join(" ");
  if (entry.fields.journal) {
    const vol = entry.fields.volume || "";
    const issue = entry.fields.number ? `(${entry.fields.number})` : "";
    const pages = pagesOf(entry);
    return finish(
      [
        head,
        `'${title}'`,
        italicize(entry.fields.journal),
        `${vol}${issue}`,
        pages ? `pp. ${pages}` : "",
      ]
        .filter(Boolean)
        .join(", ")
        .replace(", ,", ",")
    );
  }
  const site = siteOf(entry);
  return finish(
    [head, `'${title}'`, site ? italicize(site) : "", entry.fields.url].filter(Boolean).join(", ")
  );
}

function ieeeReference(entry: BibEntry): string {
  const author = ieeeAuthor(peopleOf(entry));
  const title = entry.fields.title || "Untitled";
  const year = yearOf(entry);
  if (entry.fields.journal) {
    const vol = entry.fields.volume ? `, vol. ${entry.fields.volume}` : "";
    const num = entry.fields.number ? `, no. ${entry.fields.number}` : "";
    const pages = pagesOf(entry);
    return finish(
      `${author ? `${author}, ` : ""}"${title}," ${italicize(entry.fields.journal)}${vol}${num}${
        pages ? `, pp. ${pages}` : ""
      }${year ? `, ${year}` : ""}`
    );
  }
  const site = siteOf(entry);
  return finish(
    `${author ? `${author}, ` : ""}"${title},"${site ? ` ${italicize(site)},` : ""} ${
      entry.fields.url || ""
    }${year ? `, ${year}` : ""}`
  );
}

function vancouverReference(entry: BibEntry): string {
  const author = vancouverAuthor(peopleOf(entry));
  const title = entry.fields.title || "Untitled";
  const year = yearOf(entry);
  if (entry.fields.journal) {
    const vol = entry.fields.volume || "";
    const issue = entry.fields.number ? `(${entry.fields.number})` : "";
    const pages = (entry.fields.pages || "").replace(/\s+/g, "");
    return finish(
      `${author ? `${author}. ` : ""}${title}. ${entry.fields.journal}. ${year}${
        vol || issue || pages ? ";" : ""
      }${vol}${issue}${pages ? `:${pages}` : ""}`
    );
  }
  const site = siteOf(entry);
  return finish(
    `${author ? `${author}. ` : ""}${title}. ${site ? `${site}. ` : ""}${year ? `${year}. ` : ""}${
      entry.fields.url ? `Available from: ${entry.fields.url}` : ""
    }`
  );
}

function inTextFor(entry: BibEntry, style: LocalCiteStyle): string {
  const people = peopleOf(entry);
  const year = yearOf(entry);
  if (people.length === 0) return year ? `(${year})` : "";
  const last = people[0].last || people[0].first;
  let names = last;
  if (people.length === 2) {
    const second = people[1].last || people[1].first;
    names = style === "apa" ? `${last} & ${second}` : `${last} and ${second}`;
  } else if (people.length > 2) {
    names = `${last} et al.`;
  }
  if (style === "mla") return `(${names})`;
  if (style === "apa") return year ? `(${names}, ${year})` : `(${names})`;
  return year ? `(${names} ${year})` : `(${names})`;
}
