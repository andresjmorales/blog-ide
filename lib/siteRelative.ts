/**
 * Site-relative URLs (`/writing/essay/figure.webp`, `/writing/other-essay`)
 * belong to the site the essay is published on. BlogIDE stores them as-is,
 * resolves them against the writer's main site (Settings → Integrations →
 * Main site) for display, and writes them out as absolute URLs when the essay
 * leaves for anywhere else (copy, export, publish).
 */

import { parseFrontmatterField } from "@/lib/markdown/yamlFields";

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

/** Apply `rewrite` to the markdown body outside frontmatter and code. */
function rewriteOutsideCode(
  markdown: string,
  rewrite: (prose: string) => string
): string {
  const frontmatter = markdown.match(FRONTMATTER_RE)?.[0] ?? "";
  const body = markdown.slice(frontmatter.length);
  const rewritten = body
    .split(CODE_RE)
    .map((part, index) => (index % 2 === 1 ? part : rewrite(part)))
    .join("");
  return frontmatter + rewritten;
}

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
  return rewriteOutsideCode(markdown, (part) =>
    part
      .replace(INLINE_DEST_RE, (_m, lead: string, path: string) => `${lead}${site}${path}`)
      .replace(
        REFERENCE_DEF_RE,
        (_m, lead: string, path: string, tail: string) => `${lead}${site}${path}${tail}`
      )
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Undo `absolutizeSiteRelativeMarkdown`: link and image destinations on
 * `siteUrl` go back to site-relative paths. With `onlyPaths`, only those
 * paths are touched, so URLs the writer typed out in full stay as written.
 * Used when restoring a backup that was written with absolute URLs.
 */
export function relativizeSiteMarkdown(
  markdown: string,
  siteUrl: string,
  onlyPaths?: ReadonlySet<string>
): string {
  const site = normalizeSiteUrl(siteUrl);
  if (!site || !markdown.includes(site)) return markdown;
  const origin = escapeRegExp(site);
  const strip = (lead: string, path: string) =>
    !onlyPaths || onlyPaths.has(path) ? `${lead}${path}` : `${lead}${site}${path}`;
  const inline = new RegExp(`(\\]\\(\\s*<?)${origin}(/(?!/)[^\\s)>]*)`, "g");
  const reference = new RegExp(
    `^(\\s{0,3}\\[[^\\]\\n]+\\]:\\s*<?)${origin}(/(?!/)[^\\s>]*)`,
    "gm"
  );
  return rewriteOutsideCode(markdown, (part) =>
    part
      .replace(inline, (_m, lead: string, path: string) => strip(lead, path))
      .replace(reference, (_m, lead: string, path: string) => strip(lead, path))
  );
}

/** Every site-relative link and image destination, in order of appearance. */
export function listSiteRelativePaths(markdown: string): string[] {
  const paths: string[] = [];
  rewriteOutsideCode(markdown, (part) => {
    for (const match of part.matchAll(INLINE_DEST_RE)) paths.push(match[2]);
    for (const match of part.matchAll(REFERENCE_DEF_RE)) paths.push(match[2]);
    return part;
  });
  return paths;
}

/** The site an essay's site-relative paths resolve against: its own `main_site:`, else the account's. */
export function essaySiteUrlForMarkdown(markdown: string, accountSite: string): string {
  const frontmatter = markdown.match(FRONTMATTER_RE)?.[0] ?? "";
  return resolveEssaySiteUrl(
    parseFrontmatterField(frontmatter, ESSAY_SITE_FRONTMATTER_KEY),
    accountSite
  );
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
