import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TimeoutError,
  isTimeoutError,
  withTimeout,
} from "@/lib/net/timeout";

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the work finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects with TimeoutError when the work never settles", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 1_000);
    const expectation = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await expectation;
  });
});

describe("isTimeoutError", () => {
  it("recognizes TimeoutError and abort-shaped errors", () => {
    expect(isTimeoutError(new TimeoutError())).toBe(true);
    expect(isTimeoutError(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(
      true
    );
    expect(isTimeoutError(new Error("The operation was aborted."))).toBe(true);
    expect(isTimeoutError(new Error("quota exceeded"))).toBe(false);
  });
});
