import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { AiSidebar } from "@/components/AiSidebar";
import { actionUserPrompt } from "@/lib/ai/actions";

describe("AI sidebar per-essay chats", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("keeps each essay's chat and restores it when you switch back", async () => {
    localStorage.setItem(
      "blogide.aiKeys",
      JSON.stringify({ anthropic: "sk-ant-test-key-1234" })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ text: "Reply for A" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const render = (key: string, label: string) =>
      root!.render(
        <AiSidebar
          essayAvailable
          essayKey={key}
          essayLabel={label}
          getDocumentMarkdown={() => `# ${label}\n\nBody.\n`}
        />
      );
    await act(async () => render("a", "Essay A"));
    expect(host.textContent).toContain("Essay A");

    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!;
      setter.call(textarea, "Question about A");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host!.querySelector("form")!.requestSubmit();
    });
    await act(async () => {});
    expect(host.textContent).toContain("Reply for A");

    await act(async () => render("b", "Essay B"));
    expect(host.textContent).not.toContain("Reply for A");
    expect(host.textContent).toContain("Essay B");

    await act(async () => render("a", "Essay A"));
    expect(host.textContent).toContain("Question about A");
    expect(host.textContent).toContain("Reply for A");
  });
});

describe("proofread preset", () => {
  it("asks for one patch per fix and no style changes", () => {
    const prompt = actionUserPrompt("proofread", "selection");
    expect(prompt).toContain("SEARCH/REPLACE");
    expect(prompt).toMatch(/Do not change style/);
  });
});

describe("follow-ups after applying edits", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("tells the model which suggested edits were applied", async () => {
    localStorage.setItem(
      "blogide.aiKeys",
      JSON.stringify({ anthropic: "sk-ant-test-key-1234" })
    );
    const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const replies = [
      "Typo:\n<<<SEARCH\nteh cat\n===\nthe cat\n>>>REPLACE\nTypo:\n<<<SEARCH\nteh dog\n===\nthe dog\n>>>REPLACE",
      "Looks clean now.",
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ text: replies.shift() }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );
    let essay = "# T\n\nteh cat and teh dog.\n";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <AiSidebar
          essayAvailable
          essayKey="a"
          getDocumentMarkdown={() => essay}
          onApplyMarkdown={(next) => {
            essay = next;
          }}
        />
      )
    );
    const type = async (text: string) => {
      const textarea = host!.querySelector("textarea")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!
          .set!.call(textarea, text);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => host!.querySelector("form")!.requestSubmit());
      await act(async () => {});
    };
    await type("Proofread please");
    const apply = [...host.querySelectorAll(".ai-patch button")].find(
      (b) => b.textContent === "Apply"
    ) as HTMLButtonElement;
    await act(async () => apply.click());
    expect(essay).toContain("the cat");
    await type("Anything else?");
    const last = bodies.at(-1)!.messages.at(-1)!;
    expect(last.content).toContain("the writer applied 1 of your 2 suggested edits");
    expect(last.content).toContain("Anything else?");
  });
});

describe("AI chat across a reload", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("restores this tab's chat after remounting and guards unload", async () => {
    localStorage.setItem(
      "blogide.aiKeys",
      JSON.stringify({ anthropic: "sk-ant-test-key-1234" })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ text: "Remembered reply" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const mount = async () => {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
      await act(async () =>
        root!.render(
          <AiSidebar essayAvailable essayKey="a" getDocumentMarkdown={() => "# A\n"} />
        )
      );
    };
    await mount();
    const textarea = host!.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!
        .set!.call(textarea, "First question");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => host!.querySelector("form")!.requestSubmit());
    await act(async () => {});
    expect(host!.textContent).toContain("Remembered reply");

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    act(() => root?.unmount());
    host?.remove();
    await mount();
    expect(host!.textContent).toContain("First question");
    expect(host!.textContent).toContain("Remembered reply");
  });
});
