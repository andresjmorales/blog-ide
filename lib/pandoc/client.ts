/** Browser helpers for optional Pandoc export / import. */

export type PandocStatus = {
  available: boolean;
  pdf: boolean;
};

let cached: PandocStatus | null = null;
let inflight: Promise<PandocStatus> | null = null;

export async function fetchPandocStatus(): Promise<PandocStatus> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/api/pandoc/status")
    .then(async (res) => {
      if (!res.ok) return { available: false, pdf: false };
      const body = (await res.json()) as { available?: boolean; pdf?: boolean };
      const status = {
        available: Boolean(body.available),
        pdf: Boolean(body.pdf),
      };
      cached = status;
      return status;
    })
    .catch(() => ({ available: false, pdf: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function exportMarkdownAsDocx(
  markdown: string,
  title: string
): Promise<void> {
  const res = await fetch("/api/export/docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown, title }),
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const safe = (title || "essay").replace(/[\\/:*?"<>|]+/g, "-");
  const name = safe.toLowerCase().endsWith(".docx") ? safe : `${safe}.docx`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportMarkdownAsPdf(
  markdown: string,
  title: string
): Promise<void> {
  const res = await fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown, title }),
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const safe = (title || "essay").replace(/[\\/:*?"<>|]+/g, "-");
  const name = safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importPandocFile(file: File): Promise<string> {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch("/api/import/pandoc", {
    method: "POST",
    body,
  });
  const data = (await res.json()) as { markdown?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Import failed (${res.status})`);
  }
  if (!data.markdown) throw new Error("Import returned no markdown.");
  return data.markdown;
}
