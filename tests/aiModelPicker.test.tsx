import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { AiSidebar } from "@/components/AiSidebar";

describe("AI model picker", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
    localStorage.clear();
  });

  async function renderWithKey(provider: "anthropic" | "openai") {
    localStorage.setItem(
      "blogide.aiKeys",
      JSON.stringify(
        provider === "anthropic"
          ? { anthropic: "sk-ant-test-key-1234" }
          : { openai: "sk-openai-test-key-1234", preferred: "openai" }
      )
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<AiSidebar />);
    });
    const select = host.querySelector("select");
    expect(select).toBeTruthy();
    return [...select!.querySelectorAll("option")].map((option) => ({
      id: option.value,
      label: option.textContent,
    }));
  }

  it("lists the Anthropic catalog when that key is active", async () => {
    const options = await renderWithKey("anthropic");
    expect(options.map((option) => option.id)).toEqual([
      "claude-sonnet-4-6",
      "claude-sonnet-5",
      "claude-opus-5-5",
      "claude-fable-5-1",
      "claude-haiku-4-5-20251001",
    ]);
    expect(options[0]?.label).toContain("Sonnet 4.6");
    expect(options[2]?.label).toContain("Opus 5.5");
  });

  it("lists the OpenAI catalog when that key is active", async () => {
    const options = await renderWithKey("openai");
    expect(options.map((option) => option.id)).toContain("gpt-5.5");
    expect(options.map((option) => option.id)).toContain("gpt-4.1");
    expect(options[0]?.id).toBe("gpt-4o-mini");
  });
});
