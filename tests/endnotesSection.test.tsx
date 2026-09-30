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

  it("opens the footnote card from a note's text", () => {
    const open = vi.spyOn(footnoteOpen, "openFootnoteCardNear").mockReturnValue(true);
    act(() => root.render(<Harness editor={editor} initial />));
    const body = host.querySelector<HTMLElement>('[data-endnote-id="n2"] .endnote-body')!;
    act(() => body.click());
    expect(open).toHaveBeenCalledWith("n2", body);
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
