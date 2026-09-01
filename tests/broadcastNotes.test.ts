import { describe, expect, it } from "vitest";
import {
  collapseBroadcastNotes,
  countUniqueUnreadNotes,
  type ChannelCaptureNote,
} from "@/lib/capture/broadcastNotes";

function note(
  channelId: string,
  channelName: string,
  text: string,
  at = "2026-09-01 12:30"
): ChannelCaptureNote {
  return { at, text, atMs: 1, channelId, channelName };
}

describe("collapseBroadcastNotes", () => {
  it("keeps a note that lives on one channel", () => {
    const notes = [note("g", "general", "only here")];
    expect(collapseBroadcastNotes(notes, 3)).toEqual(notes);
  });

  it("shows one row when the same stamp+text is on every channel", () => {
    const notes = [
      note("g", "general", "hello"),
      note("n", "notes", "hello"),
      note("e", "each", "hello"),
    ];
    expect(collapseBroadcastNotes(notes, 3)).toEqual([
      {
        ...notes[0],
        channelName: "all",
        channelIds: ["g", "n", "e"],
      },
    ]);
  });

  it("joins names when the copy is on some channels but not all", () => {
    const notes = [
      note("g", "general", "hello"),
      note("n", "notes", "hello"),
      note("e", "each", "different"),
    ];
    expect(collapseBroadcastNotes(notes, 3)).toEqual([
      {
        ...notes[0],
        channelName: "general, notes",
        channelIds: ["g", "n"],
      },
      notes[2],
    ]);
  });
});

describe("countUniqueUnreadNotes", () => {
  it("counts a broadcast as one unread", () => {
    const notes = [
      { at: "2026-09-01 12:30", text: "hello", atMs: 10 },
      { at: "2026-09-01 12:30", text: "hello", atMs: 10 },
      { at: "2026-09-01 12:30", text: "hello", atMs: 10 },
    ];
    expect(countUniqueUnreadNotes(notes, 0)).toBe(1);
    expect(countUniqueUnreadNotes(notes, 20)).toBe(0);
  });
});
