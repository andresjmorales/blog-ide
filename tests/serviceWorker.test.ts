import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: unknown) => void;

/** Run public/sw.js against a fake worker global and return its handlers. */
function loadWorker(fetchImpl: (req: unknown) => Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Response>();
  const cache = {
    put: vi.fn(async (key: unknown, res: Response) => {
      store.set(typeof key === "string" ? key : (key as Request).url, res);
    }),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(),
    match: vi.fn(async (key: unknown) =>
      store.get(typeof key === "string" ? key : (key as Request).url)
    ),
  };
  const self = {
    location: { origin: "https://blogide.com" },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  const source = readFileSync(path.join(__dirname, "../public/sw.js"), "utf8");
  new Function("self", "caches", "fetch", source)(self, caches, fetchImpl);
  return { handlers, cache, store };
}

function navigate(handlers: Record<string, Handler>, url: string) {
  let responded: Promise<Response> | null = null;
  handlers.fetch({
    request: { method: "GET", mode: "navigate", url },
    respondWith: (p: Promise<Response>) => {
      responded = p;
    },
  });
  return responded as Promise<Response> | null;
}

function redirectedResponse(finalUrl: string): Response {
  const res = new Response("<html></html>", { status: 200 });
  Object.defineProperty(res, "redirected", { value: true });
  Object.defineProperty(res, "url", { value: finalUrl });
  return res;
}

describe("service worker navigations", () => {
  let fetchMock: ReturnType<typeof vi.fn<(req: unknown) => Promise<Response>>>;
  beforeEach(() => {
    fetchMock = vi.fn<(req: unknown) => Promise<Response>>(
      async () => new Response("<html></html>", { status: 200 })
    );
  });

  it.each([
    "/auth/confirm?token_hash=x&type=recovery",
    "/auth/continue?token_hash=x",
    "/reset/confirm",
    "/login?next=/editor",
    "/signup?invite=abc",
    `/s/${"a".repeat(64)}`,
    "/shared",
  ])("leaves %s to the browser", (p) => {
    const { handlers } = loadWorker(fetchMock);
    expect(navigate(handlers, `https://blogide.com${p}`)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns a followed redirect into a plain redirect", async () => {
    fetchMock.mockResolvedValue(redirectedResponse("https://blogide.com/editor"));
    const { handlers, cache } = loadWorker(fetchMock);
    const res = await navigate(handlers, "https://blogide.com/")!;
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://blogide.com/editor");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("serves and caches ordinary app pages", async () => {
    const { handlers, cache } = loadWorker(fetchMock);
    const res = await navigate(handlers, "https://blogide.com/editor")!;
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalled());
  });

  it("does not store redirected shell pages at install", async () => {
    fetchMock.mockImplementation(async (url: unknown) =>
      url === "/" ? redirectedResponse("https://blogide.com/editor") : new Response("ok")
    );
    const { handlers, store } = loadWorker(fetchMock);
    let done: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(store.has("/")).toBe(false);
    expect(store.has("/editor")).toBe(true);
  });
});
