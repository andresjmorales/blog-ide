/**
 * Substack-only intro: one paragraph (e.g. "Crossposted to my personal
 * site…") that the Substack copy pastes above a divider, after a leading
 * image if the essay opens with one. Stored in frontmatter so it stays with
 * the essay and never shows on the personal site.
 */
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import {
  parseFrontmatterField,
  writeFrontmatterField,
} from "@/lib/markdown/yamlFields";

export const SUBSTACK_INTRO_KEY = "substack_intro";

export function parseSubstackIntro(frontmatter: string): string {
  return parseFrontmatterField(frontmatter, SUBSTACK_INTRO_KEY);
}

export function substackIntroFromMarkdown(markdown: string): string {
  return parseSubstackIntro(splitFrontmatter(markdown).frontmatter);
}

/**
 * The intro is markdown (`*italics*`, `[links](…)`), which a YAML parser
 * would read as an alias or a list; writeFrontmatterField quotes it.
 */
export function writeSubstackIntro(frontmatter: string, intro: string): string {
  const value = intro.replace(/\s*\n\s*/g, " ").trim();
  return writeFrontmatterField(frontmatter, SUBSTACK_INTRO_KEY, value);
}
