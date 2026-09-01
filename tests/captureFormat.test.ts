import { describe, expect, it } from "vitest";
import {
  appendCaptureBulletToMarkdown,
  formatCaptureBullet,
  formatCaptureStamp,
  parseCaptureNotes,
  removeCaptureBulletFromMarkdown,
} from "@/lib/capture/format";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

describe("capture format", () => {
  it("formats a stamped bullet", () => {
    const at = new Date(2026, 6, 17, 12, 30);
    expect(formatCaptureStamp(at)).toBe("2026-07-17 12:30");
    expect(formatCaptureBullet("hello world", at)).toBe(
      "- [2026-07-17 12:30] hello world"
    );
  });

  it("stores extra lines as indented continuations", () => {
    const at = new Date(2026, 6, 17, 12, 30);
    expect(formatCaptureBullet("line one\nline two\n\nline three", at)).toBe(
      "- [2026-07-17 12:30] line one\n  line two\n  \n  line three"
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

  it("keeps multiline bodies on one note", () => {
    const md = `- [2026-07-17 12:30] line one
  line two

  line three
- [2026-07-17 13:05] next
`;
    expect(parseCaptureNotes(md)).toEqual([
      {
        at: "2026-07-17 12:30",
        text: "line one\nline two\n\nline three",
        atMs: expect.any(Number),
      },
      {
        at: "2026-07-17 13:05",
        text: "next",
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

  it("removes a multiline capture bullet", () => {
    const md = `# Notes

- [2026-07-17 12:30] keep
- [2026-07-17 13:05] drop me
  second line
- [2026-07-17 14:00] also keep
`;
    const next = removeCaptureBulletFromMarkdown(md, {
      at: "2026-07-17 13:05",
      text: "drop me\nsecond line",
    });
    expect(next).not.toContain("drop me");
    expect(next).not.toContain("second line");
    expect(next).toContain("keep");
    expect(next).toContain("also keep");
  });

  it("parses bullets escaped by an editor round-trip (channel looked empty)", () => {
    // Opening a channel doc in the editor re-serializes `[` as `\[`.
    const md = "- \\[2026-07-17 12:30\\] check the sync badge\n";
    const notes = parseCaptureNotes(md);
    expect(notes).toHaveLength(1);
    expect(notes[0].at).toBe("2026-07-17 12:30");
    expect(notes[0].text).toBe("check the sync badge");
  });

  it("survives a real markdown pipeline round-trip", () => {
    const original = "- [2026-07-17 12:30] check the sync badge";
    const roundTripped = serializeBody(parseBody(original));
    expect(roundTripped).not.toBe(original); // escapes ARE added
    const notes = parseCaptureNotes(roundTripped);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("check the sync badge");
  });

  it("removes an escaped bullet by its parsed note", () => {
    const md = "- \\[2026-07-17 13:05\\] drop me\n- \\[2026-07-17 14:00\\] keep\n";
    const next = removeCaptureBulletFromMarkdown(md, {
      at: "2026-07-17 13:05",
      text: "drop me",
    });
    expect(next).not.toContain("drop me");
    expect(next).toContain("keep");
  });
});
