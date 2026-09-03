import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HOVER_CLOSE_DELAY_MS,
  HOVER_OPEN_DELAY_MS,
  createHoverIntent,
} from "@/lib/editor/hoverIntent";

afterEach(() => {
  vi.useRealTimers();
});

describe("createHoverIntent", () => {
  it("opens only after a pause on the same target", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const hover = createHoverIntent({ onOpen, onClose });
    hover.enter("a");
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS - 1);
    expect(onOpen).not.toHaveBeenCalled();
    hover.enter("a");
    vi.advanceTimersByTime(2);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("a");
    hover.dispose();
  });

  it("cancels a pending open when the pointer leaves or scrolls", () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const hover = createHoverIntent({ onOpen, onClose: vi.fn() });
    hover.enter("a");
    hover.leave();
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + HOVER_CLOSE_DELAY_MS);
    expect(onOpen).not.toHaveBeenCalled();

    hover.enter("a");
    hover.cancelOpen();
    vi.advanceTimersByTime(HOVER_OPEN_DELAY_MS + 20);
    expect(onOpen).not.toHaveBeenCalled();
    hover.dispose();
  });
});
