import { describe, expect, it } from "vitest";
import {
  formatNtfyAsCapture,
  selectNtfyToIngest,
} from "@/lib/ntfy/format";
import { ntfyTopicSlug } from "@/lib/ntfy/settings";

describe("ntfyTopicSlug", () => {
  it("keeps ntfy-safe characters", () => {
    expect(ntfyTopicSlug("ideas")).toBe("ideas");
    expect(ntfyTopicSlug("shower thoughts!")).toBe("showerthoughts");
    expect(ntfyTopicSlug("???")).toBe("notes");
  });
});

describe("formatNtfyAsCapture", () => {
  it("joins title and body", () => {
    expect(
      formatNtfyAsCapture({
        id: "m1",
        event: "message",
        title: "Idea",
        message: "write this down",
      })
    ).toBe("Idea: write this down");
  });

  it("skips keepalives", () => {
    expect(
      formatNtfyAsCapture({ id: "k", event: "keepalive", message: "noop" })
    ).toBeNull();
  });
});

describe("selectNtfyToIngest", () => {
  it("maps topic to a Notes channel and skips unknown topics", () => {
    const selected = selectNtfyToIngest({
      topicToChannel: new Map([["blogide-ideas-aa", "chan-ideas"]]),
      ingestedIds: new Set(),
      messages: [
        {
          id: "m1",
          event: "message",
          topic: "blogide-ideas-aa",
          message: "hello",
          time: 2,
        },
        {
          id: "m2",
          event: "message",
          topic: "someone-else",
          message: "nope",
          time: 1,
        },
      ],
    });
    expect(selected.map((row) => row.message.id)).toEqual(["m1"]);
    expect(selected[0].channelNodeId).toBe("chan-ideas");
  });
});
