import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { EssayTitleBlock } from "@/components/EssayTitleBlock";
import { newEssayFrontmatter } from "@/lib/markdown/frontmatter";

describe("EssayTitleBlock", () => {
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
  });

  function render(frontmatter = newEssayFrontmatter("My Essay")) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const commits: { title?: string; subtitle?: string; fm?: string } = {};
    act(() => {
      root!.render(
        <EssayTitleBlock
          title="My Essay"
          subtitle=""
          frontmatter={frontmatter}
          onTitleCommit={(title) => {
            commits.title = title;
          }}
          onSubtitleCommit={(subtitle) => {
            commits.subtitle = subtitle;
          }}
          onFrontmatterChange={(fm) => {
            commits.fm = fm;
          }}
        />
      );
    });
    return { commits };
  }

  it("shows title and subtitle but not an author field", () => {
    render();
    expect(
      host!.querySelector('textarea[aria-label="Essay title"]')
    ).toBeTruthy();
    expect(
      host!.querySelector('input[aria-label="Essay subtitle"]')
    ).toBeTruthy();
    expect(
      host!.querySelector('input[aria-label="Author byline"]')
    ).toBeNull();
    expect(
      host!.querySelector('button[aria-label="Essay metadata"]')
    ).toBeTruthy();
  });

  it("opens extra frontmatter fields including author and custom keys", () => {
    const fm =
      "---\ntitle: My Essay\nsubtitle:\nauthor:\npublication:\ndate:\ndescription:\ntags:\ncanonical:\nstatus: draft\nhero_image: cover.webp\n---\n";
    render(fm);
    act(() => {
      host!
        .querySelector<HTMLButtonElement>('button[aria-label="Essay metadata"]')!
        .click();
    });
    const dialog = document.querySelector('[role="dialog"][aria-label="Essay metadata"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.textContent).toContain("Author");
    expect(dialog!.textContent).toContain("Publication");
    expect(dialog!.textContent).toContain("hero_image");
    expect(
      dialog!.querySelector('input[aria-label="New frontmatter key"]')
    ).toBeTruthy();
  });
});
