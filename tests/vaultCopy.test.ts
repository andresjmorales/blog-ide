import { describe, expect, it } from "vitest";
import * as copy from "@/lib/vault/copy";

describe("vault copy", () => {
  it("does not use em dashes", () => {
    for (const [name, value] of Object.entries(copy)) {
      expect(value, name).not.toMatch(/\u2014/);
    }
  });
});
