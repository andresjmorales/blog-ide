import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const footnoteSelectionKey = new PluginKey("footnoteSelection");

/**
 * Footnote markers are `user-select: none`, so the browser never paints the
 * selection highlight on them even when a text selection includes them.
 * Tag the ones inside the current selection so CSS can highlight them too.
 * Decoration-only; nothing reaches the markdown.
 */
export const FootnoteSelectionHighlight = Extension.create({
  name: "footnoteSelectionHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: footnoteSelectionKey,
        props: {
          decorations(state) {
            const { selection } = state;
            if (!(selection instanceof TextSelection) || selection.empty) {
              return null;
            }
            const decorations: Decoration[] = [];
            state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name !== "footnoteRef") return;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: "is-in-selection",
                })
              );
            });
            return decorations.length
              ? DecorationSet.create(state.doc, decorations)
              : null;
          },
        },
      }),
    ];
  },
});
