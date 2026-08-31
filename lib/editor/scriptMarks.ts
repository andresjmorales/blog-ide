import { Mark, mergeAttributes } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { StyleParseRule } from "@tiptap/pm/model";

type MarkdownRenderHelpers = {
  renderChildren: (node: JSONContent | JSONContent[]) => string;
};

function renderMarkChildren(
  node: JSONContent,
  helpers: MarkdownRenderHelpers
): string {
  if (Array.isArray(node.content) && node.content.length > 0) {
    return helpers.renderChildren(node.content);
  }
  return helpers.renderChildren(node);
}

function verticalAlignRule(value: string): StyleParseRule {
  return {
    style: "vertical-align",
    getAttrs: (styleValue: string | string[]) => {
      const next = Array.isArray(styleValue) ? styleValue[0] : styleValue;
      return next === value ? null : false;
    },
  };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    superscript: {
      setSuperscript: () => ReturnType;
      toggleSuperscript: () => ReturnType;
      unsetSuperscript: () => ReturnType;
    };
    subscript: {
      setSubscript: () => ReturnType;
      toggleSubscript: () => ReturnType;
      unsetSubscript: () => ReturnType;
    };
  }
}

/**
 * GFM-friendly superscript. Serializes as `<sup>…</sup>` so it round-trips
 * without colliding with strikethrough `~~…~~`. HTML paste (Word, Docs,
 * fetch.bible `sup[data-v]`) maps through parseHTML. Footnote atoms use
 * `sup[data-footnote-ref]` and must not be claimed as this mark.
 */
export const Superscript = Mark.create({
  name: "superscript",
  excludes: "subscript",

  parseHTML() {
    return [
      { tag: "sup:not([data-footnote-ref])" },
      verticalAlignRule("super"),
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes), 0];
  },

  markdownOptions: {
    htmlReopen: {
      open: "<sup>",
      close: "</sup>",
    },
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRenderHelpers) =>
    `<sup>${renderMarkChildren(node, helpers)}</sup>`,

  addCommands() {
    return {
      setSuperscript:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleSuperscript:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetSuperscript:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-.": () => this.editor.commands.toggleSuperscript(),
    };
  },
});

/**
 * GFM-friendly subscript. Serializes as `<sub>…</sub>` (not `~…~`, which
 * would fight GFM strikethrough).
 */
export const Subscript = Mark.create({
  name: "subscript",
  excludes: "superscript",

  parseHTML() {
    return [{ tag: "sub" }, verticalAlignRule("sub")];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sub", mergeAttributes(HTMLAttributes), 0];
  },

  markdownOptions: {
    htmlReopen: {
      open: "<sub>",
      close: "</sub>",
    },
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRenderHelpers) =>
    `<sub>${renderMarkChildren(node, helpers)}</sub>`,

  addCommands() {
    return {
      setSubscript:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleSubscript:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetSubscript:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-,": () => this.editor.commands.toggleSubscript(),
    };
  },
});
