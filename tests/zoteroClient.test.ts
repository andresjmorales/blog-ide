import { afterEach, describe, expect, it, vi } from "vitest";
import {
  citeKeyFromZotero,
  formatZoteroCreators,
  hitFromZoteroItem,
  searchZoteroItems,
  zoteroErrorCopy,
  ZoteroApiError,
} from "@/lib/zotero/client";
import { citationHtmlToPlain } from "@/lib/zotero/citationHtml";
import type { ZoteroConfig } from "@/lib/zotero/token";

const config: ZoteroConfig = {
  apiKey: "secret-key",
  userId: "123",
  libraryType: "user",
  groupId: "",
  style: "chicago-note-bibliography",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("zotero helpers", () => {
  it("strips citation HTML to markdown-ish plain text", () => {
    expect(
      citationHtmlToPlain(
        '<div class="csl-entry">Martha C. Nussbaum, <i>Creating Capabilities</i> (Cambridge, MA: Harvard University Press, 2011).</div>'
      )
    ).toBe(
      "Martha C. Nussbaum, *Creating Capabilities* (Cambridge, MA: Harvard University Press, 2011)."
    );
    expect(citationHtmlToPlain("A &ndash; B &amp; C")).toBe("A – B & C");
  });

  it("builds a citekey from Extra or creator+year+title", () => {
    expect(
      citeKeyFromZotero({
        extra: "Citation Key: nussbaum2011",
        creators: [{ lastName: "Nussbaum" }],
        date: "2011",
        title: "Creating Capabilities",
        key: "ABCD",
      })
    ).toBe("nussbaum2011");
    expect(
      citeKeyFromZotero({
        creators: [{ lastName: "Doe", firstName: "Jane" }],
        date: "2024-05-01",
        title: "The Example",
        key: "ZZ",
      })
    ).toBe("Doe2024example");
  });

  it("formats creators compactly", () => {
    expect(
      formatZoteroCreators([
        { lastName: "Nussbaum", firstName: "Martha C." },
        { lastName: "Sen", firstName: "Amartya" },
      ])
    ).toBe("Nussbaum, Martha C. and Sen, Amartya");
  });

  it("drops notes and attachments from hits", () => {
    expect(
      hitFromZoteroItem(
        { key: "N1", data: { key: "N1", itemType: "note", title: "aside" } },
        config,
        "chicago-note-bibliography"
      )
    ).toBeNull();
  });

  it("searches Zotero with the read-only query the spec describes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("https://api.zotero.org/users/123/items");
      expect(url).toContain("q=Nussbaum");
      expect(url).toContain("qmode=titleCreatorYear");
      expect(url).toContain("itemType=-note");
      expect(url).toContain("include=data%2Ccitation%2Cbibtex");
      expect(url).not.toContain("secret-key");
      return new Response(
        JSON.stringify([
          {
            key: "ABCD2345",
            data: {
              key: "ABCD2345",
              itemType: "book",
              title: "Creating Capabilities",
              creators: [{ lastName: "Nussbaum", firstName: "Martha C." }],
              date: "2011",
            },
            citation:
              "<i>Creating Capabilities</i> (Cambridge, MA: Harvard University Press, 2011).",
            bibtex: "@book{nussbaum2011, title = {Creating Capabilities}}",
          },
        ]),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const hits = await searchZoteroItems(config, "Nussbaum", "chicago-note-bibliography");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("Creating Capabilities");
    expect(hits[0]?.citation).toContain("*Creating Capabilities*");
    expect(hits[0]?.bibtex).toContain("@book");
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Authorization")).toBe("Bearer secret-key");
  });

  it("explains a rejected key", () => {
    expect(zoteroErrorCopy(new ZoteroApiError(401, "Forbidden"))).toMatch(
      /rejected the key/i
    );
  });
});
