import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const listDocumentComments = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/comments/api", () => ({
  listDocumentComments: (...args: unknown[]) => listDocumentComments(...args),
  fetchCommentParticipants: async () => [],
  addDocumentComment: vi.fn(),
  replyToComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  setThreadStatus: vi.fn(),
}));

import { SharedEssayView } from "@/components/sharing/SharedEssayView";
import { resetCommentSession } from "@/lib/comments/store";

const MARKDOWN = `---
title: "Gardens"
---

Roses grow in spring.[[blogide-fn:n1:A_20note_20on_20tulips.]] Then summer.
`;

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe("SharedEssayView", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    listDocumentComments.mockResolvedValue({
      ok: true,
      access: "commenter",
      me: "gloria",
      threads: [
        {
          id: "t1",
          root: {
            id: "t1",
            thread_id: null,
            author_id: "gloria",
            author_name: "Gloria",
            kind: "comment",
            anchor: { scope: "body", quote: "spring", prefix: "Roses grow in ", suffix: ".", hint: 14 },
            body: "Which spring?",
            status: "open",
            created_at: "2026-09-30T10:00:00Z",
            updated_at: "2026-09-30T10:00:00Z",
            resolved_at: null,
            resolved_by: null,
          },
          replies: [],
        },
      ],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host?.remove();
    host = null;
    resetCommentSession();
  });

  it("renders the essay read-only with footnotes, notes, and threads", async () => {
    act(() => {
      root!.render(
        <SharedEssayView
          nodeId="node-1"
          name="gardens.md"
          markdown={MARKDOWN}
          role="commenter"
          ownerName="Andres"
          updatedAt="2026-09-30T10:00:00Z"
        />
      );
    });
    await settle();
    const dom = host!;
    expect(dom.querySelector("h1")?.textContent).toBe("Gardens");
    const prose = dom.querySelector(".shared-essay-prose");
    expect(prose?.getAttribute("contenteditable")).toBe("false");
    expect(prose?.textContent).toContain("Roses grow in spring.");
    expect(dom.querySelector(".footnote-ref")?.textContent).toBe("1");
    expect(dom.querySelector(".endnotes")?.textContent).toContain(
      "A note on tulips."
    );
    expect(listDocumentComments).toHaveBeenCalledWith("node-1");
    expect(dom.querySelector('[data-comment-thread="t1"]')?.textContent).toBe(
      "spring"
    );
    expect(dom.querySelector(".comment-text")?.textContent).toBe("Which spring?");
  });
});
