import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Extension, type AnyExtension, type JSONContent } from "@tiptap/core";
import { FootnoteRef } from "@/lib/editor/footnote";
import { FootnoteDeletionTracker } from "@/lib/editor/footnoteDeletion";
import { LinkShortcut } from "@/lib/editor/linkShortcut";
import {
  ImageCaptionMarkdown,
  ImageWithCaption,
} from "@/lib/editor/imageCaption";

/**
 * Spec §5.1: unknown constructs on parse are preserved as literal text —
 * never silently dropped. Without this, @tiptap/markdown discards block
 * tokens it has no handler for (e.g. GFM tables, reference definitions).
 * Each line becomes text separated by hard breaks inside one paragraph.
 */
function preserveAsLiteralText(tokenName: string): AnyExtension {
  return Extension.create({
    name: `literal-${tokenName}`,
    markdownTokenName: tokenName,
    parseMarkdown(token) {
      const raw = (token.raw ?? "").replace(/\n+$/, "");
      const content: JSONContent[] = [];
      raw.split("\n").forEach((line, i) => {
        if (i > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content };
    },
  });
}

/**
 * The exhaustive v1 node/mark set from spec §5.1:
 * paragraph, heading h1-h4, bold, italic, inline code, strikethrough, link,
 * blockquote, bullet/ordered list, image, horizontal rule, code block
 * (with language attr), hard break, and the custom footnoteRef atom.
 *
 * Shared between the editor component and the round-trip test suite so the
 * schema under test is exactly the schema being edited.
 */
export function createExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      },
      // Not part of the spec §5.1 set (underline has no markdown form).
      underline: false,
      // Adds a phantom trailing paragraph that pollutes serialization.
      trailingNode: false,
    }),
    ImageWithCaption,
    ImageCaptionMarkdown,
    FootnoteRef,
    FootnoteDeletionTracker,
    LinkShortcut,
    Markdown,
    preserveAsLiteralText("table"),
    preserveAsLiteralText("def"),
  ];
}
