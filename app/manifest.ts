import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BlogIDE",
    short_name: "BlogIDE",
    description:
      "An IDE for essays: a rich WYSIWYG editor meets a second brain, with footnotes, autosave, and optional AI.",
    start_url: "/editor",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#2f6b4f",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
