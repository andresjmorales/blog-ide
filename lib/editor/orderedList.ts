import OrderedList from "@tiptap/extension-ordered-list";
import { wrappingInputRule } from "@tiptap/core";

/**
 * Only auto-convert `1. ` into an ordered list. Typing `123. ` (etc.) stays
 * plain text so large numbers aren't trapped in an uneditable CSS marker.
 * Markdown that already uses `start` still round-trips via attrs.
 */
export const StrictOrderedList = OrderedList.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^1\.\s$/,
        type: this.type,
        getAttributes: () => ({ start: 1 }),
      }),
    ];
  },
});
