import Link from "@tiptap/extension-link";

/**
 * TipTap's stock Link sets `inclusive()` from `autolink`, so with autolink on
 * typing after a link keeps extending it. Force inclusive false (Docs-style)
 * while keeping autolink / paste behavior.
 */
export const BlogideLink = Link.extend({
  inclusive: false,
}).configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: "https",
});
