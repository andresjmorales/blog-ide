import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelEditorWork,
  flushEditorWork,
  hasScheduledEditorWork,
  resetEditorWorkSchedule,
  scheduleEditorWork,
} from "@/lib/editor/workSchedule";

describe("editor work schedule", () => {
  afterEach(() => {
    resetEditorWorkSchedule();
    vi.useRealTimers();
  });

  it("coalesces repeats of the same id until the delay elapses", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    scheduleEditorWork("find-rescan", 250, fn);
    scheduleEditorWork("find-rescan", 250, fn);
    expect(hasScheduledEditorWork("find-rescan")).toBe(true);
    vi.advanceTimersByTime(249);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(hasScheduledEditorWork("find-rescan")).toBe(false);
  });

  it("keeps separate ids independent", () => {
    vi.useFakeTimers();
    const find = vi.fn();
    const cite = vi.fn();
    scheduleEditorWork("find-rescan", 250, find);
    scheduleEditorWork("cite-inventory", 320, cite);
    vi.advanceTimersByTime(250);
    expect(find).toHaveBeenCalledTimes(1);
    expect(cite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(70);
    expect(cite).toHaveBeenCalledTimes(1);
  });

  it("flush runs pending work immediately", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    scheduleEditorWork("outline", 180, fn);
    flushEditorWork("outline");
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(180);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the callback", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    scheduleEditorWork("harper", 400, fn);
    cancelEditorWork("harper");
    vi.advanceTimersByTime(400);
    expect(fn).not.toHaveBeenCalled();
  });
});
