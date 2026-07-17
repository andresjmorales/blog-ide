import { describe, expect, it } from "vitest";
import {
  appendCaptureBulletToMarkdown,
  formatCaptureBullet,
  formatCaptureStamp,
  parseCaptureNotes,
  removeCaptureBulletFromMarkdown,
} from "@/lib/capture/format";

describe("capture format", () => {
  it("formats a stamped bullet", () => {
    const at = new Date(2026, 6, 17, 12, 30);
    expect(formatCaptureStamp(at)).toBe("2026-07-17 12:30");
    expect(formatCaptureBullet("hello world", at)).toBe(
      "- [2026-07-17 12:30] hello world"
    );
  });

  it("parses capture bullets and ignores other lines", () => {
    const md = `---
title: Notes
---

# Notes

- [2026-07-17 12:30] first
not a bullet
- [2026-07-17 13:05] second note
`;
    expect(parseCaptureNotes(md)).toEqual([
      { at: "2026-07-17 12:30", text: "first", atMs: expect.any(Number) },
      {
        at: "2026-07-17 13:05",
        text: "second note",
        atMs: expect.any(Number),
      },
    ]);
  });

  it("appends after existing body", () => {
    const at = new Date(2026, 6, 17, 14, 0);
    const next = appendCaptureBulletToMarkdown(
      "---\ntitle: Notes\n---\n\n",
      "ping",
      at
    );
    expect(next).toContain("- [2026-07-17 14:00] ping\n");
    expect(next.startsWith("---\ntitle: Notes\n---")).toBe(true);
  });

  it("removes a matching capture bullet", () => {
    const md = `# Notes

- [2026-07-17 12:30] keep
- [2026-07-17 13:05] drop me
- [2026-07-17 14:00] also keep
`;
    const next = removeCaptureBulletFromMarkdown(md, {
      at: "2026-07-17 13:05",
      text: "drop me",
    });
    expect(next).not.toContain("drop me");
    expect(next).toContain("keep");
    expect(next).toContain("also keep");
  });
});
