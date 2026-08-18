import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { EditorOverflowMenu } from "@/components/EditorOverflowMenu";
import { githubActionMenuItems } from "@/lib/github/menu";

describe("EditorOverflowMenu GitHub submenu", () => {
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

  it("nests the three GitHub actions under GitHub", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <EditorOverflowMenu
          items={[
            {
              kind: "submenu",
              id: "github",
              label: "GitHub",
              items: githubActionMenuItems({ mapped: true }).map((item) => ({
                ...item,
                onSelect: () => {},
              })),
            },
          ]}
        />
      );
    });
    act(() => {
      host!.querySelector<HTMLButtonElement>('button[title="More actions"]')!.click();
    });
    const menu = document.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain("GitHub");
    const github = [...menu!.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent?.includes("GitHub")
    ) as HTMLButtonElement;
    act(() => {
      github.click();
    });
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => item.textContent?.replace("‹", "").trim()
    );
    expect(labels).toContain("Map to GitHub…");
    expect(labels).toContain("Pull from GitHub…");
    expect(labels).toContain("Push to GitHub");
  });
});
