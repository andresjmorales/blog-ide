/**
 * Site-relative URLs (`/writing/essay/figure.webp`, `/writing/other-essay`)
 * belong to the site the essay is published on. BlogIDE stores them as-is,
 * resolves them against the writer's main site (Settings → Integrations →
 * Main site) for display, and writes them out as absolute URLs when the essay
 * leaves for anywhere else (copy, export, publish).
 */

/** `example.com`, `https://example.com/`, … → `https://example.com`, or "" if unusable. */
export function normalizeSiteUrl(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return "";
    return url.origin;
  } catch {
    return "";
  }
}

/** Root-relative path on the writer's site (`/x`, not `//cdn…` or `./x`). */
export function isSiteRelativeUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

export function resolveSiteRelativeUrl(url: string, siteUrl: string): string {
  return siteUrl && isSiteRelativeUrl(url) ? `${siteUrl}${url}` : url;
}

/**
 * The site for the essay on screen: the open essay's `main_site:` override,
 * else the account's Main site. Editor marks render outside React and read
 * it directly; node views subscribe (see `useActiveSiteUrl`).
 *
 * The setters are silent so they can run during render, before the editor
 * below them draws its links; call `notifyActiveSiteUrl` from an effect so
 * subscribed views pick up a change.
 */
let accountSiteUrl = "";
let essaySiteUrl = "";
const listeners = new Set<() => void>();

export function setAccountSiteUrl(siteUrl: string): void {
  accountSiteUrl = normalizeSiteUrl(siteUrl);
}

export function setEssaySiteOverride(siteUrl: string): void {
  essaySiteUrl = normalizeSiteUrl(siteUrl);
}

export function getActiveSiteUrl(): string {
  return essaySiteUrl || accountSiteUrl;
}

export function notifyActiveSiteUrl(): void {
  for (const listener of listeners) listener();
}

export function subscribeActiveSiteUrl(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Frontmatter key for a per-essay main site (an essay hosted elsewhere). */
export const ESSAY_SITE_FRONTMATTER_KEY = "main_site";

/** The essay's own `main_site:` if set and valid, else the account's site. */
export function resolveEssaySiteUrl(
  essayMainSite: string,
  accountSite: string
): string {
  return normalizeSiteUrl(essayMainSite) || normalizeSiteUrl(accountSite);
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const CODE_RE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;
/** `](/path` or `](</path` in an inline link or image destination. */
const INLINE_DEST_RE = /(\]\(\s*<?)(\/(?!\/)[^\s)>]*)/g;
/** `[label]: /path` reference definitions. */
const REFERENCE_DEF_RE = /^(\s{0,3}\[[^\]\n]+\]:\s*<?)(\/(?!\/)\S*?)(>?(?:\s|$))/gm;

/**
 * Rewrite site-relative link and image destinations to absolute URLs on
 * `siteUrl`. Frontmatter and code are left alone. Returns the input
 * unchanged when no site is set.
 */
export function absolutizeSiteRelativeMarkdown(
  markdown: string,
  siteUrl: string
): string {
  const site = normalizeSiteUrl(siteUrl);
  if (!site || !markdown.includes("/")) return markdown;
  const frontmatter = markdown.match(FRONTMATTER_RE)?.[0] ?? "";
  const body = markdown.slice(frontmatter.length);
  const rewritten = body
    .split(CODE_RE)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part
            .replace(INLINE_DEST_RE, (_m, lead: string, path: string) => `${lead}${site}${path}`)
            .replace(
              REFERENCE_DEF_RE,
              (_m, lead: string, path: string, tail: string) => `${lead}${site}${path}${tail}`
            )
    )
    .join("");
  return frontmatter + rewritten;
}

/** `src="/…"` / `href="/…"` in HTML (rich-text copies taken from the editor). */
export function absolutizeSiteRelativeHtml(html: string, siteUrl: string): string {
  const site = normalizeSiteUrl(siteUrl);
  if (!site) return html;
  return html.replace(
    /(\s(?:src|href)=)(["'])(\/(?!\/)[^"']*)\2/g,
    (_m, attr: string, quote: string, path: string) => `${attr}${quote}${site}${path}${quote}`
  );
}

/** How many link and image destinations are site-relative. */
export function countSiteRelativeUrls(markdown: string): {
  images: number;
  links: number;
} {
  const body = markdown.replace(FRONTMATTER_RE, "").replace(CODE_RE, "");
  let images = 0;
  let links = 0;
  for (const match of body.matchAll(/(!?)\[[^\]\n]*\]\(\s*<?\/(?!\/)/g)) {
    if (match[1]) images += 1;
    else links += 1;
  }
  links += [...body.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*<?\/(?!\/)/gm)].length;
  return { images, links };
}
