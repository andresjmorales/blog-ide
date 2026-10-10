import Link from "@tiptap/extension-link";
import { getActiveSiteUrl, resolveSiteRelativeUrl } from "@/lib/siteRelative";

/**
 * TipTap's stock Link sets `inclusive()` from `autolink`, so with autolink on
 * typing after a link keeps extending it. Force inclusive false (Docs-style)
 * while keeping autolink / paste behavior.
 */
export const BlogideLink = Link.extend({
  inclusive: false,
  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, Record<string, unknown>>;
    return {
      ...parent,
      href: {
        ...parent.href,
        // Site-relative links (`/writing/…`) point at the writer's main site
        // in the editor DOM. The stored attribute (and markdown) stay relative.
        renderHTML: (attributes: { href?: string | null }) =>
          attributes.href
            ? { href: resolveSiteRelativeUrl(attributes.href, getActiveSiteUrl()) }
            : {},
      },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: "https",
});
