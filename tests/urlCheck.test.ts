import { afterEach, describe, expect, it, vi } from "vitest";
import { probeUrl } from "@/lib/preview/urlCheck";

vi.mock("@/lib/preview/ssrf", () => ({
  assertSafePublicUrl: async (raw: string) => {
    const parsed = new URL(raw);
    return { href: parsed.href, hostname: parsed.hostname };
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetchSequence(
  responses: { status: number; url?: string }[]
) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const step = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return {
        status: step.status,
        url: step.url ?? String(input),
      } as Response;
    })
  );
}

describe("probeUrl", () => {
  it("treats 2xx HEAD as ok", async () => {
    mockFetchSequence([{ status: 200 }]);
    const result = await probeUrl("https://example.com/ok");
    expect(result.ok).toBe(true);
    expect(result.soft).toBeUndefined();
  });

  it("retries GET after HEAD 403 and soft-fails if still 403", async () => {
    mockFetchSequence([{ status: 403 }, { status: 403 }]);
    const result = await probeUrl("https://example.com/blocked");
    expect(result.ok).toBe(false);
    expect(result.soft).toBe(true);
    expect(result.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("accepts GET success after HEAD 403", async () => {
    mockFetchSequence([{ status: 403 }, { status: 200 }]);
    const result = await probeUrl("https://example.com/recover");
    expect(result.ok).toBe(true);
    expect(result.soft).toBeUndefined();
  });

  it("hard-fails on 404", async () => {
    mockFetchSequence([{ status: 404 }]);
    const result = await probeUrl("https://example.com/missing");
    expect(result.ok).toBe(false);
    expect(result.soft).toBeUndefined();
  });
});
