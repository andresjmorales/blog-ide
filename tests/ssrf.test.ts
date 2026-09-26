import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafePublicUrl,
  isPrivateIp,
  readBodyCapped,
  safePublicFetch,
} from "@/lib/preview/ssrf";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
  ])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows %s",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    }
  );
});

describe("assertSafePublicUrl", () => {
  it.each([
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://2130706433/",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost:3000/",
    "http://printer.local/",
    "file:///etc/passwd",
    "https://user:pw@93.184.216.34/",
  ])("rejects %s", async (url) => {
    await expect(assertSafePublicUrl(url)).rejects.toThrow();
  });

  it("accepts a public IP literal without DNS", async () => {
    await expect(assertSafePublicUrl("https://93.184.216.34/x")).resolves.toMatchObject({
      hostname: "93.184.216.34",
    });
  });
});

describe("safePublicFetch", () => {
  it("refuses a redirect into a private address before requesting it", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("https://93.184.216.34")) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        });
      }
      return new Response("secret");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(safePublicFetch("https://93.184.216.34/r")).rejects.toThrow(
      /Private IP/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows public redirects by hand", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://93.184.216.34/a") {
        return new Response(null, { status: 301, headers: { location: "/b" } });
      }
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await safePublicFetch("https://93.184.216.34/a");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://93.184.216.34/b",
      expect.objectContaining({ redirect: "manual" })
    );
  });
});

describe("readBodyCapped", () => {
  it("stops at the byte cap", async () => {
    const body = new Response("x".repeat(10_000));
    const bytes = await readBodyCapped(body, 1_000);
    expect(bytes.byteLength).toBe(1_000);
  });
});
