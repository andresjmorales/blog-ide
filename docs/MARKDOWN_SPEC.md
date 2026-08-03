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
| `publication` | Optional venue / magazine / paper (BlogIDE-only; personal-site ignores unknown keys) |
| `status` | Optional; new essays default to `draft`. personal-site hides `draft` / `unpublished` / `hidden` from the Writing rail (slug URL still works) |

**Empty keys:** clearing subtitle, author, or publication keeps a bare
`subtitle:` / `author:` / `publication:` line so export templates stay
stable. The sibling [`personal-site`](../../personal-site) reader
(`gray-matter` + `coerceString`) treats that as `null` — no BlogIDE change
required.

Other YAML keys (e.g. `date`, `tags`, `canonical`, or any custom key) are
preserved verbatim. BlogIDE never parse→dumps the YAML block, so unknown
fields survive round-trips and sync to personal-site without breaking either
side.

## Image captions (BlogIDE extension)

Images may carry a caption stored on the TipTap image node and serialized as
the next non-blank markdown line after the image (Substack-style), not as a
standard GFM construct. Captions support **bold**, *italic*, and
[links](https://example.com) only. See `lib/editor/imageCaption.ts`.

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
- **Parse:** ordered-list markers must be numeric (`1.` / `2)`). TipTap’s
  stock alpha/roman markers (`a.` / `St.` / `i.`) are disabled so prose like
  “St. George…” is not rewritten into a numbered list.

## Markdown typing shortcuts (rich text)

While typing in the WYSIWYG, TipTap **input rules** can auto-transform
markdown punctuation. BlogIDE defaults to **conservative** mode (Editor
settings): keep list / heading / code shortcuts; do **not** auto-wrap
bold, italic, strike, blockquote, or `---` horizontal rules — use the
toolbar (or switch to **Full** in Editor settings). Markdown source parse
still recognizes those constructs regardless of the typing preference.

## Tables

GFM pipe tables are edited via TipTap’s table extension and serialize to pipe
tables. Round-trip fixtures cover the padded canonical form TipTap emits.
The lossy-check `normalize` collapses separator dash/space padding so short
`|---|` vs TipTap’s `| ----- |` does not false-alarm on the optional
normalization banner.

## Source / split view

“View raw markdown” opens a **split** (editable markdown | debounced read-only
TipTap preview). Markdown is canonical while split/source is open; closing
applies the buffer into WYSIWYG with **no blocking lossy modal**. When
`isLossy` is true, a quiet “Show normalization” affordance can expand the
diff.

**Markdown only** (full-pane source) is off by default. Enable **Allow
markdown-only mode** in Editor settings to show it in the overflow menu; when
that setting is on, narrow viewports (≤767px) may open markdown-only instead
of split. Toggle split ↔ rich text with **Ctrl+\\** (Cmd+\\ on Mac), or use
the **Rich text** chrome button while split/source is open.

### Split preview fidelity

The right pane is a **read-only** TipTap surface (not a second editor).

| Present in preview | Absent / inactive |
| --- | --- |
| Prose, headings, lists, quotes, code, tables | Editing the preview (md buffer is canonical) |
| Numbered footnote **blobs** (tooltip = note text) | Footnote cards, nested editors, pins, sidenote rail |
| Images + captions, KaTeX math | Link edit bubble / hover OG preview |
| Title / subtitle / author (display from FM) | Outline rail, find/replace, formatting toolbar |

**Pinned / floating chrome while in split or markdown-only**

- **Stays** (workspace-level): Cleanup dialog, Essay settings, Version history,
  essay Pop-outs, Shell dock, overflow menu
- **Goes away** (unmounted with WYSIWYG): pinned footnote cards, link edit
  bubble, find panel, citation dialog, shortcut cheatsheet — reopen after
  returning to rich text

## Math / LaTeX

Inline `$…$` and display `$$…$$` are first-class nodes rendered with KaTeX in
the editor and in publication Preview. Source delimiters survive serialize /
parse. Click opens a pinnable edit popup (source + live preview + Refresh);
drag the top bar to move it. The toolbar **TeX** control inserts an inline
math node; the Ω menu can still insert delimiter pairs as plain text.

Inline `$` matching is intentionally conservative so common currency text
stays literal: bodies that are only digits / `-` / `,` / `.`, and a `$`
immediately followed by a digit (Pandoc-style), are not treated as closers.
Price ranges like `$1-$2` therefore round-trip as plain text; real math such
as `$x^2$`, `$1+2$`, or `$\alpha$` still folds. Prefer the **TeX** control
when you want a guaranteed math node.

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
