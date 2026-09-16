import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { GitHubSettingsSection } from "@/components/GitHubSettingsSection";
import { GithubApiError } from "@/lib/github/client";
import { clearGithubToken, saveGithubToken } from "@/lib/github/token";
import { clearToasts, getToasts } from "@/lib/ui/toast";

const githubWhoAmI = vi.hoisted(() => vi.fn());

vi.mock("@/lib/github/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github/client")>();
  return {
    ...actual,
    githubWhoAmI: (...args: unknown[]) => githubWhoAmI(...args),
  };
});

describe("GitHubSettingsSection token test", () => {
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
    clearGithubToken();
    clearToasts();
    githubWhoAmI.mockReset();
  });

  function render() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<GitHubSettingsSection />);
    });
  }

  it("toasts a 401 instead of burying Bad credentials under the maps list", async () => {
    saveGithubToken("ghp_testtoken");
    githubWhoAmI.mockRejectedValue(new GithubApiError(401, "Bad credentials"));
    render();
    const testBtn = [...host!.querySelectorAll("button")].find(
      (button) => button.textContent === "Test token"
    ) as HTMLButtonElement;
    expect(testBtn).toBeTruthy();
    await act(async () => {
      testBtn.click();
      await Promise.resolve();
    });
    const toast = getToasts()[0];
    expect(toast?.tone).toBe("error");
    expect(toast?.message).toMatch(/rejected the token/i);
    expect(host!.textContent).not.toContain("Bad credentials");
  });

  it("toasts a working token check", async () => {
    saveGithubToken("ghp_testtoken");
    githubWhoAmI.mockResolvedValue({ login: "octocat" });
    render();
    const testBtn = [...host!.querySelectorAll("button")].find(
      (button) => button.textContent === "Test token"
    ) as HTMLButtonElement;
    await act(async () => {
      testBtn.click();
      await Promise.resolve();
    });
    expect(getToasts()[0]?.tone).toBe("success");
    expect(getToasts()[0]?.message).toBe("Token works as @octocat.");
    expect(host!.textContent).not.toContain("Token works as @octocat.");
  });
});
