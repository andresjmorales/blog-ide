import { describe, expect, it } from "vitest";
import { extractPublishUrls } from "@/lib/preview/extractPublishUrls";

describe("extractPublishUrls", () => {
  it("collects http links and images; notes relative and data", () => {
    const md = `---
title: T
---

See [a](https://example.com/a) and ![img](https://cdn.example/x.png).
Also ![local](/writing/x/y.png) and <https://example.com/b>.
Bare https://example.com/c and ![d](data:image/png;base64,abc).
`;
    const { httpUrls, relative, skipped } = extractPublishUrls(md);
    expect(httpUrls.map((u) => u.url).sort()).toEqual(
      [
        "https://cdn.example/x.png",
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
      ].sort()
    );
    expect(httpUrls.find((u) => u.url.includes("cdn"))?.kind).toBe("image");
    expect(relative.some((u) => u.url === "/writing/x/y.png")).toBe(true);
    expect(skipped.some((s) => s.startsWith("data:"))).toBe(true);
  });
});
