import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState } from "react";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import { EndnotesSection } from "@/components/EndnotesSection";
import * as footnoteOpen from "@/lib/editor/footnoteOpen";
import {
  endnotesOpenByDefault,
  mergePrefs,
  normalizeFootnoteDisplay,
} from "@/lib/settings";

const BODY =
  "First claim.[[blogide-fn:n1:Source_20one.]] Second claim.[[blogide-fn:n2:Source_20two.]]\n";

function Harness({ editor, initial }: { editor: Editor; initial: boolean }) {
  const [open, setOpen] = useState(initial);
  return <EndnotesSection editor={editor} expanded={open} onExpandedChange={setOpen} />;
}

describe("EndnotesSection", () => {
  let root: Root;
  let host: HTMLDivElement;
  let editor: Editor;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    editor = new Editor({ extensions: createExtensions(), content: parseBody(BODY) });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    editor.destroy();
    vi.restoreAllMocks();
  });

  it("starts collapsed with a count, then lists notes in order", () => {
    act(() => root.render(<Harness editor={editor} initial={false} />));
    const toggle = host.querySelector<HTMLButtonElement>(".endnotes-toggle")!;
    expect(toggle.textContent).toContain("Notes (2)");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".endnotes-list")).toBeNull();

    act(() => toggle.click());
    const items = [...host.querySelectorAll(".endnote")];
    expect(items.map((li) => li.querySelector(".endnote-number")?.textContent)).toEqual([
      "1",
      "2",
    ]);
    expect(items[1].querySelector(".endnote-body")?.textContent).toBe("Source two.");
    expect(host.querySelectorAll(".endnote-backlink")).toHaveLength(2);
  });

  it("edits a note in place from its text", async () => {
    const open = vi.spyOn(footnoteOpen, "openFootnoteCardNear").mockReturnValue(true);
    act(() => root.render(<Harness editor={editor} initial />));
    const body = host.querySelector<HTMLElement>('[data-endnote-id="n2"] .endnote-body')!;
    await act(async () => body.click());
    expect(open).not.toHaveBeenCalled();
    const item = host.querySelector<HTMLElement>('[data-endnote-id="n2"]')!;
    expect(item.classList.contains("is-editing")).toBe(true);
    const prose = item.querySelector<HTMLElement>(".endnote-editor .ProseMirror");
    expect(prose?.textContent).toBe("Source two.");

    // Escape commits and returns to the rendered note.
    await act(async () => {
      prose!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(item.classList.contains("is-editing")).toBe(false);
    expect(item.querySelector(".endnote-body")?.textContent).toBe("Source two.");
  });

  it("opens the read-only card for invitees", () => {
    const open = vi.spyOn(footnoteOpen, "openFootnoteCardNear").mockReturnValue(true);
    editor.setEditable(false);
    act(() => root.render(<Harness editor={editor} initial />));
    const body = host.querySelector<HTMLElement>('[data-endnote-id="n2"] .endnote-body')!;
    act(() => body.click());
    expect(open).toHaveBeenCalledWith("n2", body);
    expect(host.querySelector(".endnote-editor")).toBeNull();
  });

  it("shows display-only notes in the split-view preview", () => {
    const open = vi.spyOn(footnoteOpen, "openFootnoteCardNear").mockReturnValue(true);
    editor.setEditable(false);
    act(() =>
      root.render(
        <EndnotesSection editor={editor} expanded onExpandedChange={() => {}} preview />
      )
    );
    const body = host.querySelector<HTMLElement>('[data-endnote-id="n2"] .endnote-body')!;
    expect(body.textContent).toBe("Source two.");
    expect(body.getAttribute("role")).toBeNull();
    act(() => body.click());
    expect(open).not.toHaveBeenCalled();
    expect(host.querySelector(".endnote-editor")).toBeNull();
    expect(host.querySelectorAll(".endnote-backlink")).toHaveLength(2);
  });

  it("follows footnote edits", () => {
    act(() => root.render(<Harness editor={editor} initial />));
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, {
        type: "footnoteRef",
        attrs: { id: "n3", content: "Source three." },
      });
    });
    expect(host.querySelector(".endnotes-toggle")?.textContent).toContain("Notes (3)");
  });

  it("renders nothing for an essay without footnotes", () => {
    const plain = new Editor({ extensions: createExtensions(), content: parseBody("No notes.\n") });
    act(() => root.render(<Harness editor={plain} initial />));
    expect(host.querySelector(".endnotes")).toBeNull();
    plain.destroy();
  });
});

describe("footnote display prefs", () => {
  it("defaults to the margin rail and normalizes junk", () => {
    expect(mergePrefs({}).footnoteDisplay).toBe("rail");
    expect(normalizeFootnoteDisplay("end")).toBe("end");
    expect(normalizeFootnoteDisplay("sideways")).toBe("rail");
    expect(mergePrefs({ endnotesExpanded: "yes" as unknown as boolean }).endnotesExpanded).toBeNull();
  });

  it("opens the section by default only for End of essay", () => {
    expect(endnotesOpenByDefault("end")).toBe(true);
    expect(endnotesOpenByDefault("both")).toBe(false);
  });
});
