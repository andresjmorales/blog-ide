import { afterEach, describe, expect, it, vi } from "vitest";

const listDocumentComments = vi.fn();
const addDocumentComment = vi.fn();
vi.mock("@/lib/comments/api", () => ({
  listDocumentComments: (...args: unknown[]) => listDocumentComments(...args),
  addDocumentComment: (...args: unknown[]) => addDocumentComment(...args),
  fetchCommentParticipants: async () => [],
  replyToComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  setThreadStatus: vi.fn(),
}));

import {
  getCommentSession,
  loadComments,
  resetCommentSession,
  startCommentDraft,
  submitDraft,
} from "@/lib/comments/store";

const anchor = { scope: "body" as const, quote: "x", prefix: "", suffix: "", hint: 0 };

function listing(ids: string[]) {
  return {
    ok: true,
    access: "commenter",
    me: "me",
    threads: ids.map((id) => ({
      id,
      root: { id, thread_id: null, author_id: "me", anchor, status: "open" },
      replies: [],
    })),
  };
}

afterEach(() => {
  resetCommentSession();
  listDocumentComments.mockReset();
  addDocumentComment.mockReset();
});

describe("comment session store", () => {
  it("drops a slow response for the essay you already left", async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    listDocumentComments
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockResolvedValueOnce(listing(["b1"]));
    const first = loadComments("a");
    await loadComments("b");
    releaseFirst(listing(["a1"]));
    await first;
    expect(getCommentSession().nodeId).toBe("b");
    expect(getCommentSession().threads.map((t) => t.id)).toEqual(["b1"]);
  });

  it("submits a draft, refreshes, and focuses the new thread", async () => {
    listDocumentComments.mockResolvedValueOnce(listing([]));
    await loadComments("a");
    startCommentDraft(anchor);
    addDocumentComment.mockResolvedValue({ ok: true, id: "t1" });
    listDocumentComments.mockResolvedValueOnce(listing(["t1"]));
    const outcome = await submitDraft("Nice line");
    expect(outcome.ok).toBe(true);
    expect(addDocumentComment).toHaveBeenCalledWith("a", anchor, "Nice line");
    expect(getCommentSession().draft).toBeNull();
    expect(getCommentSession().activeThreadId).toBe("t1");
  });

  it("keeps the draft and explains a refusal", async () => {
    listDocumentComments.mockResolvedValueOnce(listing([]));
    await loadComments("a");
    startCommentDraft(anchor);
    addDocumentComment.mockResolvedValue({ ok: false, reason: "forbidden" });
    const outcome = await submitDraft("hi");
    expect(outcome).toEqual({
      ok: false,
      message: "You can read comments on this essay but not add them.",
    });
    expect(getCommentSession().draft).not.toBeNull();
  });
});
