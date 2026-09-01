import { describe, expect, it } from "vitest";
import {
  captureAlreadyPresent,
  formatPushAsCapture,
  pushCreatedAt,
} from "@/lib/pushbullet/format";

describe("formatPushAsCapture", () => {
  it("joins note title and body", () => {
    expect(
      formatPushAsCapture({
        iden: "p1",
        type: "note",
        title: "Shower thought",
        body: "what if footnotes were first-class",
      })
    ).toBe("Shower thought: what if footnotes were first-class");
  });

  it("keeps newlines in the body", () => {
    expect(
      formatPushAsCapture({
        iden: "p-ml",
        type: "note",
        body: "first line\nsecond line\n\nthird",
      })
    ).toBe("first line\nsecond line\n\nthird");
  });

  it("uses body or title alone", () => {
    expect(
      formatPushAsCapture({ iden: "p2", type: "note", body: "just the body" })
    ).toBe("just the body");
    expect(
      formatPushAsCapture({ iden: "p3", type: "note", title: "just the title" })
    ).toBe("just the title");
  });

  it("formats links as markdown", () => {
    expect(
      formatPushAsCapture({
        iden: "p4",
        type: "link",
        title: "Essay",
        url: "https://example.com/x",
        body: "read later",
      })
    ).toBe("[Essay](https://example.com/x): read later");
  });

  it("formats files as markdown links without importing the bytes", () => {
    expect(
      formatPushAsCapture({
        iden: "p5",
        type: "file",
        file_name: "sketch.png",
        file_url: "https://dl.pushbulletusercontent.com/abc/sketch.png",
      })
    ).toBe("[sketch.png](https://dl.pushbulletusercontent.com/abc/sketch.png)");
  });

  it("skips empty and deleted pushes", () => {
    expect(formatPushAsCapture({ iden: "p6", type: "note" })).toBeNull();
    expect(
      formatPushAsCapture({
        iden: "p7",
        type: "note",
        body: "gone",
        active: false,
      })
    ).toBeNull();
  });
});

describe("pushCreatedAt", () => {
  it("converts unix seconds", () => {
    const unix = Date.UTC(2026, 6, 1) / 1000;
    const at = pushCreatedAt({ iden: "p", created: unix });
    expect(at.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("captureAlreadyPresent", () => {
  it("detects a matching stamped bullet", () => {
    const at = new Date(2026, 8, 1, 12, 30);
    const md = "- [2026-09-01 12:30] Shower thought: keep this\n";
    expect(captureAlreadyPresent(md, "Shower thought: keep this", at)).toBe(
      true
    );
    expect(captureAlreadyPresent(md, "something else", at)).toBe(false);
  });
});
