import { afterEach, describe, expect, it } from "vitest";
import { classifyStorageError, isBrowserOffline } from "@/lib/assets/errors";
import { QuotaExceededError } from "@/lib/assets/upload";

const originalOnLine = navigator.onLine;

afterEach(() => {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: originalOnLine,
  });
});

describe("classifyStorageError", () => {
  it("explains offline", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    expect(isBrowserOffline()).toBe(true);
    expect(classifyStorageError(new Error("offline"))).toMatch(/offline/i);
  });

  it("maps quota, auth, type, and network failures", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    expect(classifyStorageError(new QuotaExceededError())).toMatch(/quota/i);
    expect(classifyStorageError(new Error("Invalid JWT"))).toMatch(/sign in/i);
    expect(classifyStorageError(new Error("mime type not allowed"))).toMatch(
      /not allowed/i
    );
    expect(classifyStorageError(new TypeError("Failed to fetch"))).toMatch(
      /could not reach storage/i
    );
    expect(classifyStorageError(new Error("Payload too large"))).toMatch(
      /larger than storage/i
    );
  });
});
