import { describe, expect, it } from "vitest";
import { TimeoutError } from "@/lib/net/timeout";
import { classifyWorkspaceFailure } from "@/lib/workspace/connectionError";

describe("classifyWorkspaceFailure", () => {
  it("treats hung / timed-out requests as network", () => {
    expect(classifyWorkspaceFailure(new TimeoutError())).toBe("network");
    expect(
      classifyWorkspaceFailure(
        Object.assign(new Error("The operation was aborted."), {
          name: "AbortError",
        })
      )
    ).toBe("network");
  });

  it("treats fetch / CORS style errors as network", () => {
    expect(classifyWorkspaceFailure(new TypeError("Failed to fetch"))).toBe(
      "network"
    );
    expect(
      classifyWorkspaceFailure(new Error("NetworkError when attempting to fetch"))
    ).toBe("network");
  });

  it("treats auth-ish messages as auth", () => {
    expect(classifyWorkspaceFailure(new Error("JWT expired"))).toBe("auth");
    expect(classifyWorkspaceFailure(new Error("403 Forbidden"))).toBe("auth");
  });

  it("treats missing RPC / schema hints as schema", () => {
    expect(
      classifyWorkspaceFailure(new Error("Could not find the function in schema cache"))
    ).toBe("schema");
  });
});
