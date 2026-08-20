import { describe, expect, it, vi } from "vitest";
import {
  isFullscreen,
  toggleFullscreen,
  type FullscreenDocument,
} from "@/lib/fullscreen";

describe("fullscreen helper", () => {
  it("reports the Fullscreen API element", () => {
    const doc: FullscreenDocument = {
      fullscreenElement: null,
      webkitFullscreenElement: document.createElement("div"),
      documentElement: {},
    };
    expect(isFullscreen(doc)).toBe(true);
  });

  it("requests fullscreen on the document element", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const doc: FullscreenDocument = {
      fullscreenElement: null,
      documentElement: { requestFullscreen },
      exitFullscreen: vi.fn(),
    };
    await toggleFullscreen(doc);
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it("exits when already fullscreen", async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const doc: FullscreenDocument = {
      fullscreenElement: document.createElement("div"),
      documentElement: { requestFullscreen: vi.fn() },
      exitFullscreen,
    };
    await toggleFullscreen(doc);
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });
});
