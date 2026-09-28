import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { FootnoteNoteEditor } from "@/components/FootnoteNoteEditor";
import type { FootnoteFindSession } from "@/lib/editor/footnoteFindBridge";

const session: FootnoteFindSession = {
  footnoteId: "fn-1",
  occurrence: 0,
  query: "hello",
  regex: false,
  caseSensitive: false,
};

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe("FootnoteNoteEditor find highlights", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
  });

  function render(content: string) {
    root!.render(
      <FootnoteNoteEditor
        content={content}
        number={1}
        footnoteId="fn-1"
        typography={false}
        spellLang="en"
        updateAttributes={() => {}}
        isFindTarget
        findSession={session}
        pendingFocusRef={{ current: false }}
        commitRef={{ current: null }}
        dragSuppressUntilRef={{ current: 0 }}
      />
    );
  }

  function paintedMatches() {
    return host!.querySelectorAll(".blogide-find-match").length;
  }

  it("paints matches inside the open note", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => render("hello world hello"));
    await settle();
    expect(paintedMatches()).toBe(2);
    expect(host.querySelectorAll(".blogide-find-match.is-current")).toHaveLength(
      1
    );
  });

  it("repaints after external content sync (e.g. Replace from the panel)", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => render("hello world hello hello"));
    await settle();
    expect(paintedMatches()).toBe(3);

    await act(async () => render("bye world hello hello"));
    await settle();
    expect(paintedMatches()).toBe(2);
  });
});
