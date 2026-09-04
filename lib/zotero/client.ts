/**
 * Zotero Web API v3 client. Runs in the browser with the user's key
 * (CORS is enabled on api.zotero.org). Never log or persist the key.
 * Search works with a read-only key. Creating items needs library write.
 */

import type { CiteStyleId } from "@/lib/citations/citeStyle";
import { canonicalizeLibraryUrl } from "@/lib/library/urls";
import { citationHtmlToPlain } from "@/lib/zotero/citationHtml";
import type { ZoteroConfig } from "@/lib/zotero/token";

const API = "https://api.zotero.org";

export class ZoteroApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ZoteroApiError";
    this.status = status;
  }
}

export type ZoteroCreator = {
  creatorType?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
};

export type ZoteroItemData = {
  key: string;
  itemType: string;
  title?: string;
  creators?: ZoteroCreator[];
  date?: string;
  extra?: string;
  [field: string]: unknown;
};

export type ZoteroSearchHit = {
  key: string;
  itemType: string;
  title: string;
  creators: string;
  year: string;
  citeKey: string;
  citation: string;
  bibtex: string;
  libraryType: "user" | "group";
  libraryId: string;
  url?: string;
};

type ZoteroWriteResponse = {
  success?: Record<string, string>;
  successful?: Record<string, ZoteroItemResponse>;
  failed?: Record<string, { message?: string; code?: number }>;
};

type ZoteroItemResponse = {
  key?: string;
  data?: ZoteroItemData;
  citation?: string;
  bib?: string;
  bibtex?: string;
};

export function zoteroErrorCopy(
  error: unknown,
  action: "read" | "write" = "read"
): string {
  if (error instanceof ZoteroApiError) {
    if (error.status === 401 || error.status === 403) {
      return action === "write"
        ? "This Zotero key cannot add items. Create a key with library read and write at zotero.org/settings/keys."
        : "Zotero rejected the key. Create a key at zotero.org/settings/keys and check the User ID (or Group ID).";
    }
    if (error.status === 404) {
      return "Zotero library not found. Check the User ID or Group ID.";
    }
    if (error.status === 429) {
      return "Zotero rate-limited this search. Wait a moment and try again.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Zotero request failed.";
}

function libraryPath(config: ZoteroConfig): string {
  if (config.libraryType === "group") {
    return `/groups/${encodeURIComponent(config.groupId.trim())}`;
  }
  return `/users/${encodeURIComponent(config.userId.trim())}`;
}

function libraryId(config: ZoteroConfig): string {
  return config.libraryType === "group"
    ? config.groupId.trim()
    : config.userId.trim();
}

async function zoteroRequest<T>(
  config: ZoteroConfig,
  path: string,
  options: {
    params?: Record<string, string>;
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    url.searchParams.set(key, value);
  }
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  headers.set("Zotero-API-Key", config.apiKey);
  headers.set("Zotero-API-Version", "3");
  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), init);
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: string }).message)
        : `Zotero ${response.status}`;
    throw new ZoteroApiError(response.status, message);
  }
  return body as T;
}

async function zoteroFetch<T>(
  config: ZoteroConfig,
  path: string,
  params: Record<string, string>
): Promise<T> {
  return zoteroRequest<T>(config, path, { params });
}

function yearFromDate(date: string | undefined): string {
  if (!date) return "";
  const match = date.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
  return match?.[1] ?? "";
}

export function formatZoteroCreators(creators: ZoteroCreator[] | undefined): string {
  if (!creators?.length) return "";
  const names = creators
    .filter((c) => c.creatorType !== "reviewedAuthor")
    .map((c) => {
      if (c.name?.trim()) return c.name.trim();
      const last = (c.lastName ?? "").trim();
      const first = (c.firstName ?? "").trim();
      if (last && first) return `${last}, ${first}`;
      return last || first;
    })
    .filter(Boolean);
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]} et al.`;
}

export function citeKeyFromZotero(
  data: Pick<ZoteroItemData, "extra" | "creators" | "date" | "title" | "key">
): string {
  const extra = typeof data.extra === "string" ? data.extra : "";
  const fromExtra = extra.match(/Citation Key:\s*(\S+)/i);
  if (fromExtra?.[1]) return fromExtra[1];

  const creator = data.creators?.[0];
  const last =
    creator?.lastName?.trim() ||
    creator?.name?.trim().split(/\s+/).at(-1) ||
    "";
  const year = yearFromDate(data.date);
  const STOP = new Set(["the", "a", "an", "of", "and", "for", "in", "on", "to"]);
  const titleWord =
    (data.title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .find((word) => word.length > 2 && !STOP.has(word)) ?? "";
  const slug = `${last}${year}${titleWord}`.replace(/[^A-Za-z0-9]/g, "");
  return slug || data.key || "item";
}

function formattedFromItem(
  item: ZoteroItemResponse,
  style: CiteStyleId
): string {
  const citation = citationHtmlToPlain(item.citation ?? "");
  if (citation) return citation;
  if (style === "chicago-author-date") {
    const bib = citationHtmlToPlain(item.bib ?? "");
    if (bib) return bib;
  }
  return "";
}

export function hitFromZoteroItem(
  item: ZoteroItemResponse,
  config: ZoteroConfig,
  style: CiteStyleId
): ZoteroSearchHit | null {
  const data = item.data;
  const key = item.key || data?.key;
  if (!data || !key) return null;
  if (data.itemType === "attachment" || data.itemType === "note") return null;
  return {
    key,
    itemType: data.itemType,
    title: (data.title ?? "Untitled").trim() || "Untitled",
    creators: formatZoteroCreators(data.creators),
    year: yearFromDate(data.date),
    citeKey: citeKeyFromZotero(data),
    citation: formattedFromItem(item, style),
    bibtex: typeof item.bibtex === "string" ? item.bibtex.trim() : "",
    libraryType: config.libraryType,
    libraryId: libraryId(config),
    url:
      typeof data.url === "string" && data.url.trim()
        ? data.url.trim()
        : undefined,
  };
}

function includeForStyle(style: CiteStyleId): string {
  return style === "chicago-author-date"
    ? "data,citation,bib,bibtex"
    : "data,citation,bibtex";
}

export async function searchZoteroItems(
  config: ZoteroConfig,
  query: string,
  style: CiteStyleId,
  limit = 25
): Promise<ZoteroSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  // /items/top is parent records only (no child PDFs or notes). A combined
  // itemType=-note || -attachment filter is rejected as Invalid itemType.
  const items = await zoteroFetch<ZoteroItemResponse[]>(
    config,
    `${libraryPath(config)}/items/top`,
    {
      q,
      qmode: "titleCreatorYear",
      include: includeForStyle(style),
      style,
      limit: String(Math.min(50, Math.max(1, limit))),
    }
  );
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => hitFromZoteroItem(item, config, style))
    .filter((hit): hit is ZoteroSearchHit => hit !== null);
}

export async function getZoteroItem(
  config: ZoteroConfig,
  key: string,
  style: CiteStyleId
): Promise<ZoteroSearchHit | null> {
  const item = await zoteroFetch<ZoteroItemResponse>(
    config,
    `${libraryPath(config)}/items/${encodeURIComponent(key)}`,
    {
      include: includeForStyle(style),
      style,
    }
  );
  return hitFromZoteroItem(item, config, style);
}

export function zoteroSelectHref(hit: ZoteroSearchHit): string {
  const kind = hit.libraryType === "group" ? "groups" : "users";
  return `zotero://select/${kind}/${hit.libraryId}/items/${hit.key}`;
}

function urlsMatch(left: string, right: string): boolean {
  const a = canonicalizeLibraryUrl(left) ?? left.trim();
  const b = canonicalizeLibraryUrl(right) ?? right.trim();
  return Boolean(a) && a === b;
}

export async function findZoteroItemByUrl(
  config: ZoteroConfig,
  url: string,
  style: CiteStyleId
): Promise<ZoteroSearchHit | null> {
  const needle = url.trim();
  if (!needle) return null;
  const items = await zoteroFetch<ZoteroItemResponse[]>(
    config,
    `${libraryPath(config)}/items/top`,
    {
      q: needle,
      qmode: "everything",
      include: includeForStyle(style),
      style,
      limit: "10",
    }
  );
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const hit = hitFromZoteroItem(item, config, style);
    if (!hit) continue;
    const itemUrl = typeof item.data?.url === "string" ? item.data.url : "";
    if (itemUrl && urlsMatch(itemUrl, needle)) return hit;
    if (hit.url && urlsMatch(hit.url, needle)) return hit;
  }
  return null;
}

export async function createZoteroWebpage(
  config: ZoteroConfig,
  input: { url: string; title?: string },
  style: CiteStyleId
): Promise<ZoteroSearchHit> {
  const url = input.url.trim();
  if (!url) throw new ZoteroApiError(400, "Missing URL.");
  const title = (input.title || url).trim() || url;
  const created = await zoteroRequest<ZoteroWriteResponse>(
    config,
    `${libraryPath(config)}/items`,
    {
      method: "POST",
      body: [
        {
          itemType: "webpage",
          title,
          url,
          accessDate: new Date().toISOString().slice(0, 10),
        },
      ],
    }
  );
  const key =
    created.success?.["0"] ||
    created.successful?.["0"]?.key ||
    created.successful?.["0"]?.data?.key;
  if (!key) {
    const fail = created.failed?.["0"];
    throw new ZoteroApiError(
      fail?.code ?? 400,
      fail?.message || "Zotero did not create the item."
    );
  }
  const hit = await getZoteroItem(config, key, style);
  if (hit) return { ...hit, url: hit.url || url };
  return {
    key,
    itemType: "webpage",
    title,
    creators: "",
    year: "",
    citeKey: citeKeyFromZotero({ title, key }),
    citation: title,
    bibtex: "",
    libraryType: config.libraryType,
    libraryId: libraryId(config),
    url,
  };
}

export async function addUrlToZotero(
  config: ZoteroConfig,
  input: { url: string; title?: string },
  style: CiteStyleId
): Promise<{ hit: ZoteroSearchHit; created: boolean }> {
  const existing = await findZoteroItemByUrl(config, input.url, style);
  if (existing) return { hit: existing, created: false };
  return { hit: await createZoteroWebpage(config, input, style), created: true };
}
