import { describe, expect, it, vi } from "vitest";
import { isFullscreen, toggleFullscreen } from "@/lib/fullscreen";

describe("fullscreen helper", () => {
  it("reports the Fullscreen API element", () => {
    const doc = {
      fullscreenElement: null,
      webkitFullscreenElement: document.createElement("div"),
    } as Document;
    expect(isFullscreen(doc)).toBe(true);
  });

  it("requests fullscreen on the document element", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const el = { requestFullscreen };
    const doc = {
      fullscreenElement: null,
      documentElement: el,
      exitFullscreen: vi.fn(),
    } as unknown as Document;
    await toggleFullscreen(doc);
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("exits when already fullscreen", async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const doc = {
      fullscreenElement: document.createElement("div"),
      documentElement: { requestFullscreen: vi.fn() },
      exitFullscreen,
    } as unknown as Document;
    await toggleFullscreen(doc);
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });
});
