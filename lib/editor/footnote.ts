import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";

export type OrphanFootnote = {
  label: string;
  raw: string;
};

export type { DeletedFootnote };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnoteRef: {
      insertFootnote: (content?: string) => ReturnType;
      restoreDeletedFootnote: (id: string) => ReturnType;
      dismissDeletedFootnote: (id: string) => ReturnType;
    };
  }
}

export function createFootnoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function encodeFootnoteValue(value: string): string {
  // encodeURIComponent intentionally leaves !'()* unescaped, but our
  // markdown sentinel only permits an inert URL-safe alphabet.
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
    .replace(/%/g, "_");
}

export function decodeFootnoteValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/_/g, "%"));
  } catch {
    return "";
  }
}

/**
 * Inline atomic footnote reference. Its body lives in the `content` attribute
 * as markdown; numbered GFM references only exist in serialized markdown.
 */
export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      content: { default: "" },
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          orphanFootnotes: {
            default: [] as OrphanFootnote[],
            rendered: false,
          },
          deletedFootnotes: {
            default: [] as DeletedFootnote[],
            rendered: false,
          },
        },
      },
    ];
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote-ref]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, {
        "data-footnote-ref": "",
        class: "footnote-ref",
        title: node.attrs.content || "Empty footnote",
      }),
      "?",
    ];
  },

  addCommands() {
    return {
      insertFootnote:
        (content = "") =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { id: createFootnoteId(), content },
          }),

      restoreDeletedFootnote:
        (id: string) =>
        ({ state, dispatch }) => {
          const list = Array.isArray(state.doc.attrs.deletedFootnotes)
            ? (state.doc.attrs.deletedFootnotes as DeletedFootnote[])
            : [];
          const entry = list.find((item) => item.id === id);
          if (!entry) return false;
          if (dispatch) {
            const node = state.schema.nodes.footnoteRef.create({
              id: entry.id,
              content: entry.content,
            });
            const tr = state.tr
              .replaceSelectionWith(node)
              .setMeta("blogide-skip-footnote-delete", true)
              .setDocAttribute(
                "deletedFootnotes",
                list.filter((item) => item.id !== id)
              );
            dispatch(tr.scrollIntoView());
          }
          return true;
        },

      dismissDeletedFootnote:
        (id: string) =>
        ({ state, tr, dispatch }) => {
          const list = Array.isArray(state.doc.attrs.deletedFootnotes)
            ? (state.doc.attrs.deletedFootnotes as DeletedFootnote[])
            : [];
          if (!list.some((item) => item.id === id)) return false;
          if (dispatch) {
            dispatch(
              tr
                .setMeta("blogide-skip-footnote-delete", true)
                .setDocAttribute(
                  "deletedFootnotes",
                  list.filter((item) => item.id !== id)
                )
            );
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-f": () => this.editor.commands.insertFootnote(),
    };
  },

  markdownTokenName: "footnoteRef",

  markdownTokenizer: {
    name: "footnoteRef",
    level: "inline",
    start(src) {
      return src.indexOf("[[blogide-fn:");
    },
    tokenize(src) {
      const match = src.match(
        /^\[\[blogide-fn:([A-Za-z0-9._~-]+):([A-Za-z0-9._~-]*)\]\]/
      );
      if (!match) return undefined;
      return {
        type: "footnoteRef",
        raw: match[0],
        id: decodeFootnoteValue(match[1]),
        content: decodeFootnoteValue(match[2]),
      };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("footnoteRef", {
      id: typeof token.id === "string" ? token.id : createFootnoteId(),
      content: typeof token.content === "string" ? token.content : "",
    });
  },

  renderMarkdown(node: JSONContent) {
    const id = String(node.attrs?.id ?? createFootnoteId());
    const content = String(node.attrs?.content ?? "");
    return `[[blogide-fn:${encodeFootnoteValue(id)}:${encodeFootnoteValue(content)}]]`;
  },
});
