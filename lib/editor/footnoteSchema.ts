/**
 * Nested footnote editor schema: text asides only — no images, headings,
 * or nested footnotes.
 */

import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import type { AnyExtension } from "@tiptap/core";
import { BlogideLink } from "@/lib/editor/blogideLink";
import { StrictOrderedList } from "@/lib/editor/orderedList";
import { LinkShortcut } from "@/lib/editor/linkShortcut";
import { SmartQuotes } from "@/lib/editor/smartQuotes";
import { FindHighlight } from "@/lib/editor/findHighlight";

export function createFootnoteExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      underline: false,
      trailingNode: false,
      orderedList: false,
      link: false,
    }),
    BlogideLink,
    StrictOrderedList,
    LinkShortcut,
    SmartQuotes,
    Markdown,
    FindHighlight,
  ];
}

export function footnoteSchemaAllowsImages(
  extensions: AnyExtension[] = createFootnoteExtensions()
): boolean {
  return extensions.some((ext) => {
    const name = ext.name;
    return name === "image" || name === "imageWithCaption";
  });
}
