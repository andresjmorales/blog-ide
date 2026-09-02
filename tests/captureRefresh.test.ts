import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerCaptureIngest,
  requestCaptureRefresh,
} from "@/lib/capture/refresh";

describe("requestCaptureRefresh", () => {
  const unregisters: Array<() => void> = [];

  afterEach(() => {
    while (unregisters.length) unregisters.pop()?.();
  });

  it("is a no-op when nothing is registered", async () => {
    await expect(requestCaptureRefresh()).resolves.toBeUndefined();
  });

  it("runs every registered ingest and ignores unregistered ones", async () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    unregisters.push(registerCaptureIngest(first));
    const stopSecond = registerCaptureIngest(second);
    stopSecond();
    await requestCaptureRefresh();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });
});
