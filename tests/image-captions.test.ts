import { describe, expect, it } from "vitest";
import { prepareImageCaptions } from "@/lib/editor/imageCaption";
import { parseBody, serializeBody, normalize } from "@/lib/markdown/pipeline";

describe("image captions", () => {
  it("folds adjacent caption lines into image.caption on parse", () => {
    const doc = parseBody(
      "![alt](a.png)\nCaption here\n\nNext paragraph.\n"
    );
    const image = doc.content?.find((node) => node.type === "image");
    expect(image?.attrs).toMatchObject({
      src: "a.png",
      alt: "alt",
      caption: "Caption here",
    });
  });

  it("does not treat a blank-line follow-up as a caption", () => {
    const doc = parseBody("![](a.png)\n\nCaption here\n");
    const image = doc.content?.find((node) => node.type === "image");
    expect(image?.attrs?.caption ?? "").toBe("");
    const paragraph = doc.content?.find(
      (node) =>
        node.type === "paragraph" &&
        node.content?.some(
          (child) => child.type === "text" && child.text === "Caption here"
        )
    );
    expect(paragraph).toBeTruthy();
  });

  it("keeps alt on the image without inventing a caption", () => {
    const doc = parseBody("![descriptive alt](a.png)\n");
    const image = doc.content?.find((node) => node.type === "image");
    expect(image?.attrs).toMatchObject({
      src: "a.png",
      alt: "descriptive alt",
    });
    expect(String(image?.attrs?.caption ?? "")).toBe("");
  });

  it("serializes captions with a single newline (no blank line)", () => {
    const doc = parseBody("![](a.png)\nHello caption\n");
    const md = normalize(serializeBody(doc));
    expect(md).toBe("![](a.png)\nHello caption\n");
  });

  it("prepareImageCaptions leaves blank-line pairs alone", () => {
    const input = "![](a.png)\n\nHello\n";
    expect(prepareImageCaptions(input)).toBe(input);
  });

  it("preserves URLs that contain underscores and percent-encoding", () => {
    const src =
      "https://substackcdn.com/image/fetch/$s_!l4Ym!,w_1456/https%3A%2F%2Fexample.com%2Fa_b.jpeg";
    const md = `![](${src})\nLao Tzu, founder of Taoism\n`;
    const doc = parseBody(md);
    const image = doc.content?.find((node) => node.type === "image");
    expect(image?.attrs?.src).toBe(src);
    expect(image?.attrs?.caption).toBe("Lao Tzu, founder of Taoism");
    expect(normalize(serializeBody(doc))).toBe(md);
  });
});
