import { describe, expect, it } from "vitest";
import { classifyWorkspaceFailure } from "@/lib/workspace/connectionError";

describe("classifyWorkspaceFailure", () => {
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
