import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { findInEditor } from "@/lib/editor/findReplaceInEditor";
import {
  footnoteFindSessionsEqual,
  getFootnoteFindSession,
  setFootnoteFindSession,
  subscribeFootnoteFindSession,
  syncFootnoteFindSession,
} from "@/lib/editor/footnoteFindBridge";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

afterEach(() => {
  setFootnoteFindSession(null);
});

describe("footnoteFindBridge", () => {
  it("does not notify listeners when the session is unchanged", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFootnoteFindSession(listener);
    try {
      setFootnoteFindSession(null);
      expect(listener).not.toHaveBeenCalled();

      const session = {
        footnoteId: "note-1",
        occurrence: 0,
        query: "alpha",
        regex: false,
        caseSensitive: false,
      };
      setFootnoteFindSession(session);
      expect(listener).toHaveBeenCalledTimes(1);

      setFootnoteFindSession({ ...session });
      expect(listener).toHaveBeenCalledTimes(1);

      setFootnoteFindSession(null);
      expect(listener).toHaveBeenCalledTimes(2);
      setFootnoteFindSession(null);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });

  it("does not emit when a body-text match stays the active hit", () => {
    const editor = makeEditor("alpha beta alpha\n");
    const listener = vi.fn();
    const unsubscribe = subscribeFootnoteFindSession(listener);
    try {
      const matches = findInEditor(
        editor,
        { query: "alpha", regex: false, caseSensitive: false },
        "document"
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].footnotePos).toBeUndefined();

      syncFootnoteFindSession(editor, matches, 0, {
        query: "alpha",
        regex: false,
        caseSensitive: false,
      });
      expect(listener).not.toHaveBeenCalled();

      editor.commands.insertContentAt(6, "X");
      const next = findInEditor(
        editor,
        { query: "alpha", regex: false, caseSensitive: false },
        "document"
      );
      syncFootnoteFindSession(editor, next, 0, {
        query: "alpha",
        regex: false,
        caseSensitive: false,
      });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      editor.destroy();
    }
  });

  it("re-scan after an edit keeps an open card but never reopens a closed one", () => {
    const editor = makeEditor(
      "See note[^1].\n\n[^1]: alpha in the note.\n"
    );
    const opts = { query: "alpha", regex: false, caseSensitive: false };
    try {
      const matches = findInEditor(editor, opts, "document");
      expect(matches[0].footnotePos).toBeDefined();

      syncFootnoteFindSession(editor, matches, 0, opts);
      const open = getFootnoteFindSession();
      expect(open).not.toBeNull();

      syncFootnoteFindSession(editor, matches, 0, opts, { openCard: false });
      expect(getFootnoteFindSession()).toBe(open);

      // Writer closes the card, then types in the essay.
      setFootnoteFindSession(null);
      syncFootnoteFindSession(editor, matches, 0, opts, { openCard: false });
      expect(getFootnoteFindSession()).toBeNull();

      // Explicit navigation still opens it.
      syncFootnoteFindSession(editor, matches, 0, opts);
      expect(getFootnoteFindSession()?.footnoteId).toBe(open?.footnoteId);
    } finally {
      editor.destroy();
    }
  });

  it("compares session fields, not object identity", () => {
    expect(
      footnoteFindSessionsEqual(
        {
          footnoteId: "a",
          occurrence: 1,
          query: "the",
          regex: true,
          caseSensitive: true,
        },
        {
          footnoteId: "a",
          occurrence: 1,
          query: "the",
          regex: true,
          caseSensitive: true,
        }
      )
    ).toBe(true);
    expect(
      footnoteFindSessionsEqual(
        {
          footnoteId: "a",
          occurrence: 1,
          query: "the",
          regex: false,
          caseSensitive: false,
        },
        {
          footnoteId: "a",
          occurrence: 0,
          query: "the",
          regex: false,
          caseSensitive: false,
        }
      )
    ).toBe(false);
  });
});
