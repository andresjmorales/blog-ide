import StarterKit from "@tiptap/starter-kit";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Blockquote from "@tiptap/extension-blockquote";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Typography from "@tiptap/extension-typography";
import { Extension, type AnyExtension, type JSONContent } from "@tiptap/core";
import { FootnoteRef } from "@/lib/editor/footnote";
import { FootnoteDeletionTracker } from "@/lib/editor/footnoteDeletion";
import { LinkShortcut } from "@/lib/editor/linkShortcut";
import { SmartQuotes } from "@/lib/editor/smartQuotes";
import { UndoReplace, DEFAULT_TYPOGRAPHY_LOCK_MS } from "@/lib/editor/undoReplace";
import { BlogideLink } from "@/lib/editor/blogideLink";
import {
  ImageCaptionMarkdown,
  ImageWithCaption,
} from "@/lib/editor/imageCaption";
import { StrictOrderedList } from "@/lib/editor/orderedList";
import {
  BlockMath,
  InlineMath,
  MathBlockMarkdown,
  MathInlineMarkdown,
} from "@/lib/editor/math";
import { FindHighlight } from "@/lib/editor/findHighlight";
import { Subscript, Superscript } from "@/lib/editor/scriptMarks";
import type { MarkdownTypingShortcuts } from "@/lib/settings";

export type CreateExtensionsOptions = {
  /**
   * `conservative` (default): keep lists, headings, and code shortcuts;
   * disable bold/italic/strike/blockquote/HR auto-wrap. `full`: stock TipTap.
   */
  markdownTypingShortcuts?: MarkdownTypingShortcuts;
  /**
   * TipTap Typography + Docs-style smart quotes. Default true.
   * Cleanup punctuation is a separate pass.
   */
  typography?: boolean;
  /** @deprecated Use `typography`. */
  smartQuotes?: boolean;
  /** How long a substitution stays revertible. Tests may shorten this. */
  typographyLockAfterMs?: number;
};

/**
 * Marks/nodes that stay in the schema but lose auto-transform rules under
 * conservative typing shortcuts (toolbar / Mod-b / Mod-i still work).
 */
function withoutTypingRules(extension: AnyExtension): AnyExtension {
  return extension.extend({
    addInputRules() {
      return [];
    },
    addPasteRules() {
      return [];
    },
  });
}

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
 * paragraph, heading h1-h4, bold, italic, inline code, strikethrough,
 * superscript, subscript, link, blockquote, bullet/ordered list, image,
 * horizontal rule, code block (with language attr), hard break, and the
 * custom footnoteRef atom.
 *
 * Shared between the editor component and the round-trip test suite so the
 * schema under test is exactly the schema being edited.
 */
export function createExtensions(
  options: CreateExtensionsOptions = {}
): AnyExtension[] {
  const typing = options.markdownTypingShortcuts ?? "conservative";
  const conservative = typing === "conservative";
  const typographyOn = options.typography ?? options.smartQuotes ?? true;

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      // Replaced by BlogideLink (inclusive:false — don't keep typing in links).
      link: false,
      // Not part of the spec §5.1 set (underline has no markdown form).
      underline: false,
      // Adds a phantom trailing paragraph that pollutes serialization.
      trailingNode: false,
      // Replaced by StrictOrderedList (only `1. ` auto-triggers).
      orderedList: false,
      // Conservative: re-register without input/paste rules below.
      ...(conservative
        ? {
            bold: false,
            italic: false,
            strike: false,
            blockquote: false,
            horizontalRule: false,
          }
        : {}),
    }),
    ...(conservative
      ? [
          withoutTypingRules(Bold),
          withoutTypingRules(Italic),
          withoutTypingRules(Strike),
          withoutTypingRules(Blockquote),
          withoutTypingRules(HorizontalRule),
        ]
      : []),
    BlogideLink,
    Superscript,
    Subscript,
    StrictOrderedList,
    TableKit.configure({
      table: { resizable: false },
    }),
    ImageWithCaption,
    ImageCaptionMarkdown,
    InlineMath,
    BlockMath,
    MathInlineMarkdown,
    MathBlockMarkdown,
    FootnoteRef,
    FootnoteDeletionTracker,
    LinkShortcut,
    UndoReplace.configure({
      lockAfterMs: options.typographyLockAfterMs ?? DEFAULT_TYPOGRAPHY_LOCK_MS,
    }),
    SmartQuotes.configure({ enabled: typographyOn }),
    ...(typographyOn
      ? [
          Typography.configure({
            // Our SmartQuotes rules are Docs-style; skip the package's quotes.
            openDoubleQuote: false,
            closeDoubleQuote: false,
            openSingleQuote: false,
            closeSingleQuote: false,
          }),
        ]
      : []),
    FindHighlight,
    Markdown,
    preserveAsLiteralText("def"),
  ];
}
