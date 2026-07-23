# BlogIDE markdown vs GFM

BlogIDE is markdown-native: the rich-text editor and the on-disk `.md` file
share one extension set and CI enforces byte-for-byte round trips for supported
constructs. This note lists where BlogIDE intentionally differs from (or
extends) [GitHub Flavored Markdown](https://github.github.com/gfm/).

## Frontmatter

Essays may begin with a YAML block between `---` fences. BlogIDE treats
frontmatter as opaque aside from a few keys it edits in the UI:

| Key | Role |
| --- | --- |
| `title` | Essay title (also drives suggested filename) |
| `subtitle` | Optional deck under the title |
| `author` | Optional byline |
| `status` | Optional; new essays default to `draft`. personal-site hides `draft` / `unpublished` / `hidden` from the Writing rail (slug URL still works) |

**Empty keys:** clearing the subtitle keeps a bare `subtitle:` line so export
templates stay stable. The sibling [`personal-site`](../../personal-site)
reader (`gray-matter` + `coerceString`) treats that as `null` — no BlogIDE
change required.

Other YAML keys (e.g. `date`, `tags`, `canonical`, or any custom key) are
preserved verbatim. BlogIDE never parse→dumps the YAML block, so unknown
fields survive round-trips and sync to personal-site without breaking either
side.

## Image captions (BlogIDE extension)

Images may carry a caption stored on the TipTap image node and serialized as
the next non-blank markdown line after the image (Substack-style), not as a
standard GFM construct. See `lib/editor/imageCaption.ts`.

Broken or empty image URLs are hidden in the rich-text view; the markdown
source still contains the `![…](…)` line so the URL can be fixed.

## Footnotes

Footnote bodies live in inline TipTap atoms and serialize to ordered GFM-style
references plus definitions (`[^n]` / `[^n]: …`). Nested block content inside
notes is supported where the shared extension set allows it.

## Lists

- Bullet and ordered lists follow normal GFM serialization.
- **Input rule:** only typing `1. ` auto-starts an ordered list. Digits other
  than `1` followed by `.` stay plain text (avoids trapping `123.` in a CSS
  list marker). Existing markdown lists with `start` ≠ 1 still round-trip.

## Tables

GFM pipe tables are edited via TipTap’s table extension and serialize to pipe
tables. Round-trip fixtures cover the padded canonical form TipTap emits.
The lossy-check `normalize` collapses separator dash/space padding so short
`|---|` vs TipTap’s `| ----- |` does not false-alarm when leaving source mode.

## Math / LaTeX

Inline `$…$` and display `$$…$$` are first-class nodes rendered with KaTeX in
the editor and in publication Preview. Source delimiters survive serialize /
parse. Click opens a pinnable edit popup (source + live preview + Refresh);
drag the top bar to move it. The toolbar **TeX** control inserts an inline
math node; the Ω menu can still insert delimiter pairs as plain text.

## Literals / non-goals

- Constructs without a TipTap handler are preserved as literal text paragraphs
  on parse (never silently dropped) — see `preserveAsLiteralText` in
  `lib/editor/extensions.ts` (e.g. reference link definitions).
- Underline has no markdown form and is disabled.
- Paragraph “indent” via Tab is not a portable markdown feature and is out of
  scope; Tab still nests list items and inserts into code blocks where wired.

## Related

- Extension set: `lib/editor/extensions.ts`
- Parse / serialize: `lib/markdown/pipeline.ts`
- Publication HTML: `lib/preview/publicationHtml.ts`
