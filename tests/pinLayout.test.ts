import { describe, expect, it } from "vitest";
import { inferPandocImportFormat } from "@/lib/pandoc/run";
import {
  persistablePin,
  parsePersistedPins,
  serializePersistedPins,
  type PinWindow,
} from "@/lib/pins/pinStore";

describe("inferPandocImportFormat", () => {
  it("accepts docx and odt by name or mime", () => {
    expect(inferPandocImportFormat("essay.docx")).toBe("docx");
    expect(
      inferPandocImportFormat(
        "x.bin",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe("docx");
    expect(inferPandocImportFormat("notes.odt")).toBe("odt");
    expect(inferPandocImportFormat("essay.md")).toBeNull();
  });
});

describe("pin layout persist", () => {
  it("keeps document, link, and bible pins and drops pdf/shell/tool panels", () => {
    const doc: PinWindow = {
      id: "doc:abc",
      kind: "document",
      nodeId: "abc",
      title: "Essay",
      left: 40,
      top: 50,
      width: 300,
      height: 400,
      zIndex: 41,
    };
    const link: PinWindow = {
      id: "link:https://example.com",
      kind: "link",
      url: "https://example.com",
      title: "Example",
      left: 80,
      top: 90,
      width: 320,
      height: 280,
      zIndex: 42,
    };
    const pdf: PinWindow = {
      id: "pdf:blob:1",
      kind: "pdf",
      src: "blob:1",
      title: "Paper",
      left: 10,
      top: 10,
      width: 400,
      height: 500,
      zIndex: 43,
    };
    const bible: PinWindow = {
      id: "bible:app",
      kind: "bible",
      title: "Bible",
      left: 120,
      top: 80,
      width: 400,
      height: 560,
      zIndex: 44,
    };
    expect(persistablePin(pdf)).toBeNull();
    const serialized = serializePersistedPins([doc, link, pdf, bible]);
    expect(serialized.map((row) => row.kind)).toEqual([
      "document",
      "link",
      "bible",
    ]);
    const parsed = parsePersistedPins(serialized);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ kind: "document", nodeId: "abc" });
    expect(parsed[1]).toMatchObject({
      kind: "link",
      url: "https://example.com",
    });
    expect(parsed[2]).toMatchObject({ kind: "bible", title: "Bible" });
  });

  it("ignores malformed storage JSON", () => {
    expect(parsePersistedPins(null)).toEqual([]);
    expect(parsePersistedPins([{ kind: "document" }])).toEqual([]);
  });
});
