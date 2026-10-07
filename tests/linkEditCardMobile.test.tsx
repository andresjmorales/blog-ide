import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Editor } from "@tiptap/core";
import { LinkEditCard } from "@/components/editor/LinkEditCard";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";

vi.mock("@/lib/preview/client", () => ({
  fetchLinkPreview: vi.fn(async (url: string) => ({
    url,
    title: url.includes("one") ? "Page One Title" : "Page Two Title",
    description: "",
    siteName: "example.com",
    image: null,
    citation: {
      itemType: "journalArticle",
      title: "t",
      url,
      creators: [{ firstName: "Jane", lastName: "Smith" }],
      date: "2021-04-02",
    },
  })),
}));

function nextFrame() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve())
  );
}

describe("LinkEditCard on touch", () => {
  let editor: Editor | null = null;
  let cardRoot: Root | null = null;
  let cardHost: HTMLDivElement | null = null;
  let editorHost: HTMLDivElement | null = null;

  afterEach(() => {
    if (cardRoot) {
      act(() => {
        cardRoot!.unmount();
      });
      cardRoot = null;
    }
    cardHost?.remove();
    cardHost = null;
    editor?.destroy();
    editor = null;
    editorHost?.remove();
    editorHost = null;
  });

  function mount(body: string) {
    editorHost = document.createElement("div");
    document.body.appendChild(editorHost);
    editor = new Editor({
      element: editorHost,
      extensions: createExtensions(),
      content: parseBody(body),
    });
    cardHost = document.createElement("div");
    document.body.appendChild(cardHost);
    cardRoot = createRoot(cardHost);
    act(() => {
      cardRoot!.render(<LinkEditCard editor={editor} showPreviews />);
    });
  }

  function textInput() {
    return document.querySelector(
      'input[aria-label="Link text"]'
    ) as HTMLInputElement;
  }

  async function tap(anchor: Element, afterClick?: () => void) {
    await act(async () => {
      anchor.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      afterClick?.();
      await nextFrame();
      await Promise.resolve();
    });
  }

  it("shows the second link after tapping it even if the selection snaps back", async () => {
    mount("See [One](https://one.example) and [Two](https://two.example).\n");
    const [first, second] = editor!.view.dom.querySelectorAll("a[href]");

    await tap(first);
    expect(textInput().value).toBe("One");

    const firstPos = editor!.state.selection.from;
    // Touch browsers can restore the previous caret after the tap.
    await tap(second, () => {
      editor!.commands.setTextSelection(firstPos);
    });
    expect(textInput().value).toBe("Two");
    expect(
      (document.querySelector('input[aria-label="Link URL"]') as HTMLInputElement)
        .value
    ).toBe("https://two.example");

    // Apply targets the tapped link, not wherever the caret went.
    editor!.commands.setTextSelection(firstPos);
    await act(async () => {
      const apply = [...document.querySelectorAll(".link-edit-actions button")]
        .find((el) => el.textContent === "Apply") as HTMLButtonElement;
      apply.click();
      await nextFrame();
    });
    expect(editor!.getText()).toContain("See One and Two.");
  });

  it("Use title replaces the link text and shows author and year", async () => {
    mount("Read [this](https://one.example) now.\n");
    const [anchor] = editor!.view.dom.querySelectorAll("a[href]");
    await tap(anchor);
    await act(async () => {
      await Promise.resolve();
    });

    expect(document.querySelector(".link-hover-byline")?.textContent).toBe(
      "Jane Smith · 2021"
    );
    const useTitle = [...document.querySelectorAll(".link-hover-actions button")]
      .find((el) => el.textContent === "Use title") as HTMLButtonElement;
    expect(useTitle).toBeTruthy();

    await act(async () => {
      useTitle.click();
      await Promise.resolve();
    });
    expect(editor!.getText()).toBe("Read Page One Title now.");
    expect(textInput().value).toBe("Page One Title");
    expect(document.querySelector(".link-edit-card")).toBeTruthy();
    // Hidden once the text already matches the title.
    expect(
      [...document.querySelectorAll(".link-hover-actions button")].some(
        (el) => el.textContent === "Use title"
      )
    ).toBe(false);
    // Mark covers exactly the new text.
    const link = editor!.view.dom.querySelector("a[href]");
    expect(link?.textContent).toBe("Page One Title");
  });
});
