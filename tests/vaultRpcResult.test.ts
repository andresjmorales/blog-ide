import { describe, expect, it } from "vitest";
import {
  isRetryableVaultRpcError,
  parseCreateVaultResult,
} from "@/lib/vault/rpcResult";

describe("parseCreateVaultResult", () => {
  it("reads a jsonb object", () => {
    expect(
      parseCreateVaultResult({ ok: true, nodeId: "abc-123" })
    ).toEqual({ ok: true, nodeId: "abc-123" });
  });

  it("parses a JSON string", () => {
    expect(
      parseCreateVaultResult('{"ok":true,"nodeId":"n1"}')
    ).toEqual({ ok: true, nodeId: "n1" });
  });

  it("maps exists", () => {
    expect(parseCreateVaultResult({ ok: false, reason: "exists" })).toEqual({
      ok: false,
      reason: "exists",
    });
  });

  it("rejects an empty payload", () => {
    expect(() => parseCreateVaultResult(null)).toThrow("Could not create the vault.");
  });
});

describe("isRetryableVaultRpcError", () => {
  it("retries PostgREST schema-cache misses", () => {
    expect(
      isRetryableVaultRpcError({
        code: "PGRST202",
        message: "Could not find the function public.create_vault in the schema cache",
      })
    ).toBe(true);
  });

  it("does not retry ordinary failures", () => {
    expect(
      isRetryableVaultRpcError({
        code: "42501",
        message: "permission denied",
      })
    ).toBe(false);
  });
});
