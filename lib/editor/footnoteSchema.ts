/**
 * Nested footnote editor schema: text asides only — no images, headings,
 * or nested footnotes.
 */

import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Typography from "@tiptap/extension-typography";
import type { AnyExtension } from "@tiptap/core";
import { BlogideLink } from "@/lib/editor/blogideLink";
import { StrictOrderedList } from "@/lib/editor/orderedList";
import { LinkShortcut } from "@/lib/editor/linkShortcut";
import { SmartQuotes } from "@/lib/editor/smartQuotes";
import { UndoReplace, DEFAULT_TYPOGRAPHY_LOCK_MS } from "@/lib/editor/undoReplace";
import { FindHighlight } from "@/lib/editor/findHighlight";
import { Subscript, Superscript } from "@/lib/editor/scriptMarks";

export function createFootnoteExtensions(options: {
  typography?: boolean;
  /** @deprecated Use `typography`. */
  smartQuotes?: boolean;
  typographyLockAfterMs?: number;
} = {}): AnyExtension[] {
  const typographyOn = options.typography ?? options.smartQuotes ?? true;
  return [
    StarterKit.configure({
      heading: false,
      underline: false,
      trailingNode: false,
      orderedList: false,
      link: false,
    }),
    BlogideLink,
    Superscript,
    Subscript,
    StrictOrderedList,
    LinkShortcut,
    UndoReplace.configure({
      lockAfterMs: options.typographyLockAfterMs ?? DEFAULT_TYPOGRAPHY_LOCK_MS,
    }),
    SmartQuotes.configure({ enabled: typographyOn }),
    ...(typographyOn
      ? [
          Typography.configure({
            openDoubleQuote: false,
            closeDoubleQuote: false,
            openSingleQuote: false,
            closeSingleQuote: false,
          }),
        ]
      : []),
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
