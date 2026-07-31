import { extractPublishUrls } from "@/lib/preview/extractPublishUrls";

const BATCH_SIZE = 8;

type UrlCheckResult = {
  url: string;
  ok: boolean;
  status?: number;
  error?: string;
  soft?: boolean;
};

export type PrePublishRow = {
  url: string;
  kind: "link" | "image" | "relative" | "skipped";
  ok: boolean | null;
  status?: number;
  error?: string;
  note?: string;
  /** Bot-wall / soft failure — warn, don't count as hard fail. */
  soft?: boolean;
};

export type PrePublishReport = {
  rows: PrePublishRow[];
  checked: number;
  failed: number;
  warned: number;
  skipped: number;
};

async function checkBatch(urls: string[]): Promise<UrlCheckResult[]> {
  const res = await fetch("/api/url-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  const data = (await res.json()) as {
    results?: UrlCheckResult[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `URL check failed (${res.status})`);
  }
  return data.results || [];
}

export async function runPrePublishCheck(
  markdown: string
): Promise<PrePublishReport> {
  const { httpUrls, relative, skipped } = extractPublishUrls(markdown);
  const rows: PrePublishRow[] = [];

  for (let i = 0; i < httpUrls.length; i += BATCH_SIZE) {
    const batch = httpUrls.slice(i, i + BATCH_SIZE);
    const results = await checkBatch(batch.map((u) => u.url));
    const byUrl = new Map(results.map((r) => [r.url, r]));
    for (const item of batch) {
      const result = byUrl.get(item.url);
      rows.push({
        url: item.url,
        kind: item.kind,
        ok: result?.ok ?? false,
        status: result?.status,
        error: result?.error,
        soft: result?.soft,
      });
    }
  }

  for (const item of relative) {
    rows.push({
      url: item.url,
      kind: "relative",
      ok: null,
      note: "Site-relative; resolve on the published host",
    });
  }

  for (const url of skipped) {
    rows.push({
      url,
      kind: "skipped",
      ok: null,
      note: "Skipped (anchor, mailto, or data:)",
    });
  }

  return {
    rows,
    checked: httpUrls.length,
    failed: rows.filter((r) => r.ok === false && !r.soft).length,
    warned: rows.filter((r) => r.ok === false && r.soft).length,
    skipped: relative.length + skipped.length,
  };
}
