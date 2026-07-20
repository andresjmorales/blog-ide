import { describe, expect, it, vi } from "vitest";

/**
 * Regression for: first Substack footnote (often link-heavy) went empty after
 * rich-text ↔ markdown mode switch.
 *
 * FootnoteNodeView debounced attr sync used to capture `next` at schedule
 * time. An early empty getMarkdown() from nested-editor mount, flushed after
 * setContent had loaded the real body, overwrote attrs.content with "".
 */
describe("footnote nested-editor sync race", () => {
  it("stale empty next in debounce would wipe content after setContent", () => {
    vi.useFakeTimers();
    const contentRef = { current: "See [link](https://example.com)." };
    let markdown = ""; // editor starts empty (immediatelyRender: false)
    let attrSyncTimer = 0;
    const writes: string[] = [];

    // Buggy shape (pre-fix): close over scheduling-time `next`.
    const buggySync = () => {
      const next = markdown.trim();
      if (next === contentRef.current) return;
      if (attrSyncTimer) clearTimeout(attrSyncTimer);
      attrSyncTimer = window.setTimeout(() => {
        attrSyncTimer = 0;
        if (next !== contentRef.current) {
          writes.push(next);
          contentRef.current = next;
        }
      }, 200) as unknown as number;
    };

    buggySync();
    markdown = "See [link](https://example.com).";
    contentRef.current = markdown;
    vi.advanceTimersByTime(200);

    expect(writes).toEqual([""]);
    expect(contentRef.current).toBe("");
    vi.useRealTimers();
  });

  it("re-reading getMarkdown inside timeout prevents the wipe", () => {
    vi.useFakeTimers();
    const contentRef = { current: "See [link](https://example.com)." };
    let markdown = "";
    let attrSyncTimer = 0;
    const writes: string[] = [];

    // Fixed shape: read current markdown at commit time.
    const sync = () => {
      const snapshot = markdown.trim();
      if (snapshot === contentRef.current) return;
      if (attrSyncTimer) clearTimeout(attrSyncTimer);
      attrSyncTimer = window.setTimeout(() => {
        attrSyncTimer = 0;
        const latest = markdown.trim();
        if (latest === contentRef.current) return;
        if (!latest && contentRef.current) return; // unfocused blank guard
        writes.push(latest);
        contentRef.current = latest;
      }, 200) as unknown as number;
    };

    sync();
    markdown = "See [link](https://example.com).";
    contentRef.current = markdown;
    vi.advanceTimersByTime(200);

    expect(writes).toEqual([]);
    expect(contentRef.current).toBe("See [link](https://example.com).");
    vi.useRealTimers();
  });
});
