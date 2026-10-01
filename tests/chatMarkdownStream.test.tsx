import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ChatMarkdown } from "@/components/ChatMarkdown";

describe("ChatMarkdown while streaming", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    vi.useRealTimers();
  });

  it("keeps repainting while chunks arrive faster than the throttle", async () => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    let text = "";
    // A chunk every 50ms for a second: never a 250ms pause.
    for (let i = 0; i < 20; i += 1) {
      text += `word${i} `;
      act(() => root!.render(<ChatMarkdown markdown={text} streaming />));
      act(() => vi.advanceTimersByTime(50));
    }
    expect(host.textContent).toContain("word14");
  });
});
