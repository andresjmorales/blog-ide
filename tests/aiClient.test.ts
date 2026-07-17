import { describe, expect, it } from "vitest";
import { essayChatSystem, unwrapMarkdownReply } from "@/lib/ai/client";

describe("unwrapMarkdownReply", () => {
  it("strips markdown fences", () => {
    expect(unwrapMarkdownReply("```markdown\n# Hi\n\nBody\n```")).toBe(
      "# Hi\n\nBody"
    );
  });

  it("returns plain text unchanged", () => {
    expect(unwrapMarkdownReply("Just a critique.")).toBe("Just a critique.");
  });
});

describe("essayChatSystem", () => {
  it("embeds the essay and explains footnotes", () => {
    const system = essayChatSystem(
      "---\ntitle: Test\n---\n\nHello[^1].\n\n[^1]: A note."
    );
    expect(system).toContain("title: Test");
    expect(system).toContain("Hello[^1].");
    expect(system).toContain("[^1]:");
    expect(system).toMatch(/not as continuation of the main argument/i);
  });
});
