import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { EditorPrefsProvider } from "@/components/EditorPrefsContext";
import { PublishDialog } from "@/components/PublishDialog";
import { mergePrefs } from "@/lib/settings";

const ESSAY = `---
title: Checklist
---

Claim.[^1] Verse <sup>27</sup>.

![Chart](https://abc.supabase.co/storage/v1/object/sign/assets/a.png?token=t)

:::poetry
A line
  indented
:::

[^1]: Note.
`;

describe("Publish dialog Substack checklist", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
  });

  function render(markdown: string) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <EditorPrefsProvider prefs={mergePrefs({})} updatePrefs={() => {}}>
          <PublishDialog
            open
            onClose={() => {}}
            getMarkdown={() => markdown}
            snapshot={markdown}
            title="Checklist"
            subtitle=""
            allowServerChecks={false}
          />
        </EditorPrefsProvider>
      );
    });
  }

  it("lists only the risky items in the essay, checked by default", () => {
    render(ESSAY);
    const list = document.querySelector(".blogide-publish-checklist");
    expect(list).not.toBeNull();
    const text = list!.textContent ?? "";
    expect(text).toContain("1 footnote → native Substack footnotes");
    expect(text).toContain("Copy 1 image");
    expect(text).toContain("expire in about a day");
    expect(text).toContain("1 superscript/subscript");
    expect(text).toContain("1 poem → Substack poetry");
    expect(text).not.toContain("table");
    const boxes = [...list!.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes).toHaveLength(4);
    expect(boxes.every((box) => box.checked)).toBe(true);
    expect(document.body.textContent).toContain("Copy text with markers and images");
  });

  it("switches the detail to the static fallback when unchecked", () => {
    render(ESSAY);
    const box = document.querySelector<HTMLInputElement>(
      ".blogide-publish-checklist input[type=checkbox]"
    )!;
    act(() => box.click());
    expect(box.checked).toBe(false);
    expect(document.body.textContent).toContain("static ¹ numbers");
  });

  it("says the helper is not needed for a plain essay", () => {
    render("# Plain\n\nJust text.\n");
    expect(document.querySelector(".blogide-publish-checklist")).toBeNull();
    expect(document.body.textContent).toContain("Nothing risky found");
    expect(document.body.textContent).toContain("Run the helper (not needed)");
  });
});
