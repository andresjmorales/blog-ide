import { afterEach, describe, expect, it } from "vitest";
import { looksTechnicalError, toastCopyFromError } from "@/lib/ui/toastCopy";
import {
  clearToasts,
  dismissToast,
  getToasts,
  showErrorToast,
  showSuccessToast,
  showToast,
} from "@/lib/ui/toast";

afterEach(() => {
  clearToasts();
});

describe("toastCopyFromError", () => {
  it("keeps human-written app errors", () => {
    const copy = toastCopyFromError(
      "This Zotero key cannot add items. Create a key with library read and write."
    );
    expect(copy.technical).toBe(false);
    expect(copy.message).toMatch(/cannot add items/i);
    expect(copy.detail).toBeUndefined();
  });

  it("hides stacks and engine dumps behind Something went wrong", () => {
    const raw =
      "TypeError: Failed to fetch\n    at fetchReaderExtract (client.ts:20:15)";
    const copy = toastCopyFromError(raw);
    expect(copy.technical).toBe(true);
    expect(copy.message).toBe("Something went wrong");
    expect(copy.detail).toContain("TypeError");
  });

  it("uses a fallback when the throw is empty", () => {
    expect(toastCopyFromError(null, "Could not load the reader extract.")).toEqual({
      message: "Could not load the reader extract.",
      technical: true,
    });
  });

  it("flags JSON and long dumps as technical", () => {
    expect(looksTechnicalError('{"code":"PGRST202","message":"oops"}')).toBe(
      true
    );
    expect(looksTechnicalError("Could not reach Storage. Try again.")).toBe(
      false
    );
  });
});

describe("toast store", () => {
  it("stacks toasts and replaces the same key", () => {
    showToast({ message: "First", replaceKey: "cite-zotero-search" });
    showToast({ message: "Second", replaceKey: "cite-zotero-search" });
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0]?.message).toBe("Second");
  });

  it("caps the stack at three", () => {
    showToast("one");
    showToast("two");
    showToast("three");
    showToast("four");
    expect(getToasts().map((item) => item.message)).toEqual([
      "two",
      "three",
      "four",
    ]);
  });

  it("records success and error helpers", () => {
    const ok = showSuccessToast("Downloaded Word file.");
    const bad = showErrorToast(
      new TypeError("Failed to fetch"),
      "Could not add to Zotero."
    );
    expect(getToasts().find((item) => item.id === ok)?.tone).toBe("success");
    const err = getToasts().find((item) => item.id === bad);
    expect(err?.tone).toBe("error");
    expect(err?.message).toBe("Could not add to Zotero.");
    expect(err?.detail).toMatch(/Failed to fetch/);
    dismissToast(ok);
    expect(getToasts()).toHaveLength(1);
  });
});
