import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { LinkPreviewSnippet } from "@/components/editor/LinkPreviewSnippet";
import type { LinkPreview } from "@/lib/preview/openGraph";

vi.mock("@/lib/preview/client", () => ({
  fetchLinkPreview: vi.fn(),
}));

describe("LinkPreviewSnippet", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
  });

  function mount(
    preview: LinkPreview | null,
    extras?: { loading?: boolean; error?: string | null }
  ) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const onPinAndRead = vi.fn();
    act(() => {
      root!.render(
        <LinkPreviewSnippet
          url="https://example.com/page"
          preview={preview}
          loading={extras?.loading === true}
          error={extras?.error ?? null}
          onPinAndRead={onPinAndRead}
        />
      );
    });
    return { onPinAndRead };
  }

  it("reserves a thumbnail placeholder when no image has loaded", () => {
    mount(null, { loading: true });
    expect(document.querySelector(".link-preview-thumb-placeholder")).toBeTruthy();
    expect(document.querySelector(".link-preview-thumb-img")).toBeNull();
    expect(document.body.textContent).toContain("Loading preview…");
  });

  it("keeps a fixed thumbnail and clamps a long SEO summary", () => {
    mount({
      url: "https://example.com/page",
      title: "Example title",
      description:
        "A great starting point for information about vegan diets. ".repeat(12),
      siteName: "Example",
      image: "https://example.com/og.png",
    });
    const img = document.querySelector(
      ".link-preview-thumb-img"
    ) as HTMLImageElement | null;
    expect(img?.src).toContain("https://example.com/og.png");
    expect(document.querySelector(".link-hover-desc")?.className).toContain(
      "link-hover-desc"
    );
    expect(document.querySelector('a[title="Open in new tab"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Pin and read here");
    expect(document.querySelector('button[aria-label="Copy title"]')).toBeNull();
  });

  it("pins and auto-opens the extract", () => {
    const { onPinAndRead } = mount({
      url: "https://example.com/page",
      title: "Example title",
      description: "Summary",
      siteName: "Example",
      image: null,
    });
    expect(document.querySelector(".link-preview-thumb-placeholder")).toBeTruthy();
    const pin = [...document.querySelectorAll("button")].find((btn) =>
      btn.textContent?.includes("Pin and read here")
    );
    expect(pin).toBeTruthy();
    act(() => {
      pin!.click();
    });
    expect(onPinAndRead).toHaveBeenCalledTimes(1);
  });
});
