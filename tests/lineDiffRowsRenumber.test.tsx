import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { LineDiffRows } from "@/components/DiffViewer";
import { unifiedLineDiff } from "@/lib/markdown/diff";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("LineDiffRows footnote renumbers", () => {
  it("starts folded and shows the -/+ pair when opened", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const lines = unifiedLineDiff("Alms.[^67]\nOld.", "Alms.[^76]\nNew.");
    act(() => root!.render(<LineDiffRows lines={lines} />));

    const toggle = host.querySelector<HTMLButtonElement>(".line-diff-renumber-toggle")!;
    expect(toggle.textContent).toContain("Footnotes renumbered only ([^67] → [^76])");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelectorAll(".lossy-diff-remove")).toHaveLength(1);

    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const removed = [...host.querySelectorAll(".lossy-diff-remove")].map((n) => n.textContent);
    expect(removed).toContain("-Alms.[^67]");
  });
});
