import { describe, expect, it } from "vitest";
import {
  classifyReaderHost,
  extractMainText,
} from "@/lib/preview/readerExtract";

describe("classifyReaderHost", () => {
  it("detects Wikipedia and LessWrong hosts", () => {
    expect(classifyReaderHost("https://en.wikipedia.org/wiki/Tea")).toBe(
      "wikipedia"
    );
    expect(classifyReaderHost("https://www.lesswrong.com/posts/abc")).toBe(
      "lesswrong"
    );
    expect(classifyReaderHost("https://www.alignmentforum.org/posts/x")).toBe(
      "lesswrong"
    );
    expect(classifyReaderHost("https://example.com/post")).toBe("generic");
  });
});

describe("extractMainText", () => {
  it("prefers mw-parser-output and strips infobox chrome", () => {
    const html = `
      <div id="mw-content-text">
        <table class="infobox"><tr><td>Sidebar junk</td></tr></table>
        <div class="mw-parser-output">
          <p>Tea is a drink.</p>
          <sup class="reference">[1]</sup>
        </div>
        <div class="printfooter">Retrieved from</div>
      </div>
    `;
    const text = extractMainText(html, "https://en.wikipedia.org/wiki/Tea");
    expect(text).toContain("Tea is a drink.");
    expect(text).not.toContain("Sidebar junk");
    expect(text).not.toContain("Retrieved from");
  });

  it("extracts LessWrong post bodies", () => {
    const html = `
      <div class="PostsPage-postContent">
        <p>Alignment is hard.</p>
      </div>
      <div class="PostsPage-footer">comments</div>
    `;
    const text = extractMainText(
      html,
      "https://www.lesswrong.com/posts/abc"
    );
    expect(text).toContain("Alignment is hard.");
    expect(text).not.toContain("comments");
  });

  it("falls back to article/main for generic pages", () => {
    const html = `
      <nav>Home</nav>
      <article><p>The essay body.</p></article>
      <footer>Copyright</footer>
    `;
    expect(extractMainText(html, "https://example.com/x")).toContain(
      "The essay body."
    );
  });
});
