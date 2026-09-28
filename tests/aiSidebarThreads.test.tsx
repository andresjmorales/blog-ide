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
