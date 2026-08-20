import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { collectBibleRefHits } from "@/lib/bible/hits";
import {
  FETCH_BIBLE_ENHANCER_SCRIPT,
  FETCH_BIBLE_TRANSLATION_ID,
} from "@/lib/bible/constants";
import { buildPublicationDocument } from "@/lib/preview/publicationHtml";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("collectBibleRefHits", () => {
  it("maps references onto ProseMirror positions", () => {
    const editor = makeEditor("See John 3:16 today.\n");
    try {
      const hits = collectBibleRefHits(editor.state.doc);
      expect(hits).toHaveLength(1);
      expect(hits[0]?.text).toBe("John 3:16");
      expect(editor.state.doc.textBetween(hits[0]!.from, hits[0]!.to)).toBe(
        "John 3:16"
      );
      expect(hits[0]?.search).toBe("jhn3:16");
    } finally {
      editor.destroy();
    }
  });

  it("skips inline code and code blocks", () => {
    const editor = makeEditor(
      "Plain John 3:16 and `Jn 3:16`.\n\n```\nRomans 8:28\n```\n"
    );
    try {
      const hits = collectBibleRefHits(editor.state.doc);
      expect(hits.map((hit) => hit.text)).toEqual(["John 3:16"]);
    } finally {
      editor.destroy();
    }
  });
});

describe("buildPublicationDocument fetch(bible)", () => {
  it("omits the enhancer unless enabled", () => {
    const html = buildPublicationDocument("---\ntitle: T\n---\n\nJohn 3:16\n");
    expect(html).not.toContain(FETCH_BIBLE_ENHANCER_SCRIPT);
  });

  it("injects the official enhancer script when enabled", () => {
    const html = buildPublicationDocument("---\ntitle: T\n---\n\nJohn 3:16\n", {
      fetchBible: true,
    });
    expect(html).toContain(FETCH_BIBLE_ENHANCER_SCRIPT);
    expect(html).toContain(`data-trans="${FETCH_BIBLE_TRANSLATION_ID}"`);
  });
});
