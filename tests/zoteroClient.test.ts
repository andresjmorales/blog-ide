import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addUrlToZotero,
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("https://api.zotero.org/users/123/items/top");
      expect(url).toContain("q=Nussbaum");
      expect(url).toContain("qmode=titleCreatorYear");
      expect(url).not.toContain("itemType=");
      expect(url).toContain("include=data%2Ccitation%2Cbibtex");
      expect(url).not.toContain("secret-key");
      expect(init?.headers).toBeInstanceOf(Headers);
      expect((init?.headers as Headers).get("Authorization")).toBe(
        "Bearer secret-key"
      );
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
    expect(fetchMock).toHaveBeenCalled();
  });

  it("explains a rejected key", () => {
    expect(zoteroErrorCopy(new ZoteroApiError(401, "Forbidden"))).toMatch(
      /rejected the key/i
    );
    expect(zoteroErrorCopy(new ZoteroApiError(403, "Forbidden"), "write")).toMatch(
      /cannot add items/i
    );
  });

  it("adds a webpage to Zotero and skips a URL that is already there", async () => {
    const existing = {
      key: "WEB1",
      data: {
        key: "WEB1",
        itemType: "webpage",
        title: "Essay",
        url: "https://example.com/a",
      },
      citation: "Essay.",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "POST") {
        expect(url).toContain("/users/123/items");
        expect(url).not.toContain("?");
        const body = JSON.parse(String(init?.body)) as Array<{ url?: string }>;
        expect(body[0]?.url).toBe("https://example.com/new");
        return new Response(
          JSON.stringify({ success: { "0": "NEW1" }, successful: {}, failed: {} }),
          { status: 200 }
        );
      }
      if (url.includes("q=https%3A%2F%2Fexample.com%2Fa")) {
        return new Response(JSON.stringify([existing]), { status: 200 });
      }
      if (url.includes("/items/NEW1")) {
        return new Response(
          JSON.stringify({
            key: "NEW1",
            data: {
              key: "NEW1",
              itemType: "webpage",
              title: "New page",
              url: "https://example.com/new",
            },
            citation: "New page.",
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const already = await addUrlToZotero(
      config,
      { url: "https://example.com/a", title: "Essay" },
      "chicago-note-bibliography"
    );
    expect(already.created).toBe(false);
    expect(already.hit.key).toBe("WEB1");

    const created = await addUrlToZotero(
      config,
      { url: "https://example.com/new", title: "New page" },
      "chicago-note-bibliography"
    );
    expect(created.created).toBe(true);
    expect(created.hit.key).toBe("NEW1");
    expect(created.hit.url).toBe("https://example.com/new");
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "POST")).toBe(
      true
    );
  });
});
