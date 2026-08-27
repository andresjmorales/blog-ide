import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Editor } from "@tiptap/core";
import { LinkEditCard } from "@/components/editor/LinkEditCard";
import { createExtensions } from "@/lib/editor/extensions";
import { promptForLink } from "@/lib/editor/linkShortcut";
import { parseBody } from "@/lib/markdown/pipeline";

vi.mock("@/lib/preview/client", () => ({
  fetchLinkPreview: vi.fn(async () => {
    throw new Error("preview unused in this test");
  }),
}));

describe("LinkEditCard text and URL fields", () => {
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
      cardRoot!.render(<LinkEditCard editor={editor} showPreviews={false} />);
    });
  }

  it("shows text and URL fields and focuses URL for selected prose", () => {
    mount("Hello world\n");
    act(() => {
      editor!.commands.setTextSelection({ from: 1, to: 6 });
      promptForLink(editor!);
    });
    const textInput = document.querySelector(
      'input[aria-label="Link text"]'
    ) as HTMLInputElement | null;
    const urlInput = document.querySelector(
      'input[aria-label="Link URL"]'
    ) as HTMLInputElement | null;
    expect(textInput?.value).toBe("Hello");
    expect(urlInput?.value).toBe("");
    expect(document.activeElement).toBe(urlInput);
    expect(
      [...document.querySelectorAll(".link-edit-field-label")].map(
        (el) => el.textContent
      )
    ).toEqual(["Text", "URL"]);
    expect(document.querySelector('button[aria-label="Copy text"]')).toBeTruthy();
  });

  it("focuses the text field for a naked URL and lets it be edited", () => {
    mount("[https://example.com](https://example.com)\n");
    act(() => {
      editor!.commands.setTextSelection(2);
      promptForLink(editor!);
    });
    const textInput = document.querySelector(
      'input[aria-label="Link text"]'
    ) as HTMLInputElement | null;
    expect(textInput?.value).toBe("https://example.com");
    expect(document.activeElement).toBe(textInput);
  });

  it("refreshes display text from the editor the next time the bubble opens", async () => {
    mount("[Example](https://example.com)\n");
    act(() => {
      editor!.commands.setTextSelection(2);
      promptForLink(editor!);
    });
    expect(
      (document.querySelector('input[aria-label="Link text"]') as HTMLInputElement)
        .value
    ).toBe("Example");

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    });
    expect(document.querySelector(".link-edit-card")).toBeNull();

    act(() => {
      editor!.view.dispatch(editor!.state.tr.insertText("s", 7));
    });
    expect(editor!.state.doc.textBetween(1, 9)).toBe("Examplse");

    act(() => {
      editor!.commands.setTextSelection(2);
      promptForLink(editor!);
    });
    expect(
      (document.querySelector('input[aria-label="Link text"]') as HTMLInputElement)
        .value
    ).toBe("Examplse");
  });

  it("does not auto-focus fields on click, and refreshes text after typing", async () => {
    mount("[Example](https://example.com)\n");
    act(() => {
      editor!.commands.setTextSelection(2);
    });
    const anchor = editor!.view.dom.querySelector("a[href]");
    expect(anchor).toBeTruthy();

    await act(async () => {
      anchor!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    });

    const textInput = document.querySelector(
      'input[aria-label="Link text"]'
    ) as HTMLInputElement | null;
    const urlInput = document.querySelector(
      'input[aria-label="Link URL"]'
    ) as HTMLInputElement | null;
    expect(textInput?.value).toBe("Example");
    expect(document.activeElement).not.toBe(textInput);
    expect(document.activeElement).not.toBe(urlInput);

    act(() => {
      editor!.view.dispatch(editor!.state.tr.insertText("s", 7));
    });
    expect(textInput?.value).toBe("Examplse");
  });
});
