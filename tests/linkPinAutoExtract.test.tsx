import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { LinkPinBody } from "@/components/pins/LinkPinBody";
import {
  closePin,
  getPinWindows,
  openLinkPin,
} from "@/lib/pins/pinStore";

const fetchReaderExtract = vi.fn(async () => ({
  url: "https://example.com/page",
  title: "Example",
  siteName: "Example",
  text: "Readable extract body",
}));

vi.mock("@/lib/preview/client", () => ({
  fetchReaderExtract: (...args: unknown[]) => fetchReaderExtract(...args),
}));

describe("link pin auto extract", () => {
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
    for (const pin of getPinWindows()) {
      closePin(pin.id);
    }
    fetchReaderExtract.mockClear();
  });

  it("stores autoExtract on Pin and read here", () => {
    openLinkPin({
      url: "https://example.com/page",
      title: "Example",
      autoExtract: true,
    });
    const pin = getPinWindows().find((w) => w.kind === "link");
    expect(pin && pin.kind === "link" && pin.autoExtract).toBe(true);
  });

  it("loads the extract when autoExtract is set", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <LinkPinBody
          pin={{
            id: "link:https://example.com/page",
            kind: "link",
            url: "https://example.com/page",
            title: "Example",
            left: 0,
            top: 0,
            width: 360,
            height: 320,
            zIndex: 40,
            autoExtract: true,
          }}
        />
      );
      await Promise.resolve();
    });
    expect(fetchReaderExtract).toHaveBeenCalledWith(
      "https://example.com/page"
    );
    expect(document.body.textContent).toContain("Readable extract body");
  });
});
