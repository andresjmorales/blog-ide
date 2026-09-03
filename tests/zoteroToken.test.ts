import { afterEach, describe, expect, it } from "vitest";
import {
  clearZoteroConfig,
  isZoteroConnected,
  loadZoteroConfig,
  maskZoteroKey,
  saveZoteroConfig,
} from "@/lib/zotero/token";

afterEach(() => {
  clearZoteroConfig();
});

describe("zotero token storage", () => {
  it("stays disconnected until a key and library id are saved", () => {
    expect(isZoteroConnected(loadZoteroConfig())).toBe(false);
    saveZoteroConfig({
      apiKey: "abcd1234efgh",
      userId: "99",
      libraryType: "user",
    });
    const saved = loadZoteroConfig();
    expect(saved.apiKey).toBe("abcd1234efgh");
    expect(saved.userId).toBe("99");
    expect(isZoteroConnected(saved)).toBe(true);
    expect(maskZoteroKey(saved.apiKey)).toBe("abcd…efgh");
  });

  it("requires a group id for group libraries", () => {
    saveZoteroConfig({
      apiKey: "abcd1234efgh",
      libraryType: "group",
      groupId: "",
    });
    expect(isZoteroConnected()).toBe(false);
    saveZoteroConfig({ groupId: "555" });
    expect(isZoteroConnected()).toBe(true);
  });
});
