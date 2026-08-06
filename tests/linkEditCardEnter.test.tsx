import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { Editor } from "@tiptap/core";
import { LinkEditCard } from "@/components/editor/LinkEditCard";
import { createExtensions } from "@/lib/editor/extensions";
import { promptForLink } from "@/lib/editor/linkShortcut";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

vi.mock("@/lib/preview/client", () => ({
  fetchLinkPreview: vi.fn(async () => {
    throw new Error("preview unused in this test");
  }),
}));

/**
 * Regression: confirming Ctrl+K with Enter must apply the href and return to
 * the document — not insert a newline / delete the selected link text.
 *
 * TipTap's focus() sync-focuses the DOM on Safari during the command. If
 * applyHref chain-focuses while handling Enter, WebKit can deliver that Enter
 * into ProseMirror (deleting the selection + splitting the block). We emulate
 * that by using a Safari UA and forwarding Enter into the editor whenever it
 * is focused during the input keydown.
 */
describe("LinkEditCard Enter confirm", () => {
  let editor: Editor | null = null;
  let cardRoot: Root | null = null;
  let cardHost: HTMLDivElement | null = null;
  let editorHost: HTMLDivElement | null = null;
  let previousUserAgent: string;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: previousUserAgent,
      configurable: true,
    });
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

  function setInputValue(input: HTMLInputElement, value: string) {
    const proto = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    );
    proto?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("Enter applies the link without inserting a newline or dropping the text", async () => {
    previousUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      configurable: true,
    });

    editorHost = document.createElement("div");
    document.body.appendChild(editorHost);
    editor = new Editor({
      element: editorHost,
      extensions: createExtensions(),
      content: parseBody("Hello world\n"),
    });

    let enterInFlight = false;
    const dom = editor.view.dom as HTMLElement;
    const originalDomFocus = dom.focus.bind(dom);
    dom.focus = ((...args: Parameters<HTMLElement["focus"]>) => {
      originalDomFocus(...args);
      if (!enterInFlight) return;
      // Browser-like: Enter lands in the editor after sync focus during keydown.
      editor!.commands.keyboardShortcut("Enter");
    }) as HTMLElement["focus"];

    cardHost = document.createElement("div");
    document.body.appendChild(cardHost);
    cardRoot = createRoot(cardHost);
    act(() => {
      cardRoot!.render(<LinkEditCard editor={editor} showPreviews={false} />);
    });

    // Select "Hello"
    act(() => {
      editor!.commands.setTextSelection({ from: 1, to: 6 });
    });
    expect(editor!.state.doc.textBetween(1, 6)).toBe("Hello");

    act(() => {
      promptForLink(editor!);
    });

    const input = document.querySelector(
      ".link-edit-input"
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();

    await act(async () => {
      setInputValue(input!, "https://example.com/path");
      enterInFlight = true;
      input!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
      enterInFlight = false;
      // Flush close()'s requestAnimationFrame focus return.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    });

    const md = serializeBody(editor!.getJSON());
    expect(md).toContain("[Hello](https://example.com/path)");
    expect(editor!.getText()).toBe("Hello world");
    // Bubble should close after confirm.
    expect(document.querySelector(".link-edit-card")).toBeNull();
  });
});
