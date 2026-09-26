import { describe, expect, it } from "vitest";
import { mergePrefs } from "@/lib/settings";
import {
  extractSharedUrl,
  parseSurfaceParam,
  resolveStartSurface,
  sharedLinkTitle,
} from "@/lib/mobile/surface";

describe("mobile surfaces", () => {
  it("parses shortcut params, with aliases", () => {
    expect(parseSurfaceParam("notes")).toBe("notes");
    expect(parseSurfaceParam("AI")).toBe("ai");
    expect(parseSurfaceParam("assistant")).toBe("ai");
    expect(parseSurfaceParam("shell")).toBe("notes");
    expect(parseSurfaceParam("files")).toBeNull();
    expect(parseSurfaceParam(null)).toBeNull();
  });

  it("resolves the launch surface", () => {
    expect(
      resolveStartSurface({ param: "ai", start: "notes", last: "library" })
    ).toBe("ai");
    expect(
      resolveStartSurface({ param: null, start: "last", last: "library" })
    ).toBe("library");
    expect(resolveStartSurface({ param: null, start: "last", last: null })).toBe(
      "editor"
    );
    expect(
      resolveStartSurface({ param: null, start: "notes", last: "ai" })
    ).toBe("notes");
  });

  it("migrates the old Open Notes on phone toggle", () => {
    expect(mergePrefs({}).mobileStartSurface).toBe("last");
    expect(mergePrefs({ mobileOpenShell: false }).mobileStartSurface).toBe(
      "editor"
    );
    expect(
      mergePrefs({ mobileOpenShell: false, mobileStartSurface: "notes" })
        .mobileStartSurface
    ).toBe("notes");
  });
});

describe("share target links", () => {
  it("prefers the url field", () => {
    expect(
      extractSharedUrl({ url: "https://example.com/a", text: "https://b.test" })
    ).toBe("https://example.com/a");
  });

  it("finds a link inside shared text and trims trailing punctuation", () => {
    expect(
      extractSharedUrl({ text: "Great read (https://example.com/post)." })
    ).toBe("https://example.com/post");
  });

  it("returns null when nothing looks like a link", () => {
    expect(extractSharedUrl({ text: "just a thought", title: "hi" })).toBeNull();
  });

  it("titles from the share title, else the text around the link", () => {
    const url = "https://example.com/post";
    expect(sharedLinkTitle({ title: "A Post", text: url }, url)).toBe("A Post");
    expect(sharedLinkTitle({ text: `A Post ${url}` }, url)).toBe("A Post");
    expect(sharedLinkTitle({ title: url, text: url }, url)).toBeUndefined();
  });
});
