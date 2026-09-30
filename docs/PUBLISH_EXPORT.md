# Publishing from BlogIDE

BlogIDE is the place to write. Other editors, Word, and HTML/PDF are exit
ramps. Footnotes are first-class in BlogIDE; they are not first-class on
most paste targets.

## Copy formats

Essay menu → **Copy**:

- **Rich text** — the same formatted clipboard as selecting the essay in
  the editor and copying (Ctrl+A / Ctrl+C). Other rich editors, including
  Substack, paste headings, bold, quotes, and links. Footnotes stay as
  BlogIDE’s editor marks, not native Substack notes.
- **Markdown** — source only. Substack will treat this as plain text.
- **HTML** — publication HTML with linked endnotes.

**Prepare publish** opens the Publish panel. Its Other editors tab has copy buttons that describe
the footnote shape rather than a platform name:

1. **Bracketed numbers `[1]`** — `[1]` in the body and a Notes list at the
   end. Also used as step 1 of the Substack helper.
2. **Superscript numbers** — `<sup>1</sup>` in the body and a Notes list at
   the end. Readable static notes. This is the honest paste for editors that
   have no footnote schema (including Medium) and for a Substack draft you
   are not going to convert with the helper.
3. **Linked HTML endnotes** — numbered refs linked to notes, plus back-links.
   Same family as Export → HTML. Use this for Ghost, WordPress, a personal
   site, or a standalone file.

Clipboard `text/plain` is a readable rendering of that HTML, never the
markdown source (some editors will otherwise paste the markdown). Hover tips
from Preview are stripped from the copy payload; the downloaded HTML file
matches Preview (plus print CSS).

Pasting HTML cannot create native footnotes in another editor.

### Substack

The Substack editor is TipTap/ProseMirror. Native footnotes are
`footnoteAnchor` inline nodes plus `footnote` blocks, created only by
`editor.commands.insertFootnote()`. That command is what you trigger from
Substack’s own footnote UI.

Pasting HTML cannot create those nodes. Substack’s paste sanitizer:

- keeps headings, bold, italic, links, lists, quotes, and most images
- strips hash-link footnotes and custom classes such as `footnote-anchor`
- will often paste `text/plain` when that payload looks like markdown

So a clipboard that puts **markdown source** in `text/plain` looks identical
to Copy → Markdown. Mimicking Substack’s *published* HTML
(`<a class="footnote-anchor" href="#footnote-1">`) does not recreate native
editor footnotes either. That markup is what BlogIDE *imports* from a
published Substack page; it is not what the editor accepts on paste.

Honest options:

1. **Superscript numbers** — formatted HTML, `<sup>1</sup>` in the body, a
   Notes list at the end. Readable. Not clickable native Substack notes.
2. **Text with markers + helper** — paste `[1]` markers and a Notes list,
   then run BlogIDE’s helper in the Substack tab so it calls
   `insertFootnote()` for you (plus superscripts, LaTeX, and poems; see
   the checklist below).

The helper is a console script / bookmarklet, not a Playwright robot.
Automating a logged-in Substack session from BlogIDE would mean stealing
cookies. Ryan Greenblatt’s
[Playwright gist](https://gist.github.com/rgreenblatt/fe15e19f1b7cc553892dda0ecc50602b)
is a last-resort local script if you want that; BlogIDE does not ship it.

Other converters ([md-to-substack](https://md-to-substack.netlify.app/),
pandoc HTML + `xclip`, Bear “Copy as HTML”) only solve rich-text paste.
They do not create native Substack footnotes.

### Medium

Medium has no footnote schema. The usual workaround is a superscript in
the body and a Notes list at the end (sometimes with a `^` back-link after
publish, using Medium’s generated paragraph ids). **Superscript numbers**
emits that static form. Hash links to `#fn-1` are omitted; Medium rewrites
ids on publish.

### HTML

Copy → HTML / Export → HTML / **Linked HTML endnotes** is BlogIDE’s
publication HTML: numbered refs, linked endnotes, captions, KaTeX. Hover
tips from Preview are stripped from the copy payload; the downloaded file
matches Preview (plus print CSS).

### Word (Pandoc)

Export → Word (`.docx`) runs Pandoc when `PANDOC_PATH` is set. Pandoc
markdown footnotes become real Word footnotes. That is the one downstream
format that preserves native notes without a helper.

### PDF

Two paths:

- **PDF (print)** — always available. Opens Preview and the browser print
  dialog; choose Save as PDF. Footnotes stay numbered endnotes, same as
  Preview.
- **PDF (Pandoc)** — needs `PANDOC_PATH` *and* a PDF engine (`xelatex`,
  `pdflatex`, `weasyprint`, or `typst`). Engine footnotes look like a
  printed paper (LaTeX) or HTML-ish (WeasyPrint). Typical Vercel deploys
  have neither Pandoc nor TeX.

## Copy vs Export

| Action | Clipboard | File | Footnotes |
| --- | --- | --- | --- |
| Copy → Rich text | Editor HTML + plain | — | BlogIDE footnote marks |
| Copy → Markdown | Markdown | — | GFM `[^1]` |
| Copy → HTML | HTML + readable plain | — | Linked endnotes |
| Publish → Superscript numbers | HTML + readable plain | — | Static `<sup>` + Notes |
| Publish → Bracketed numbers [1] | HTML with helper markers + Notes list | — | For the Substack helper |
| Publish → Linked HTML endnotes | HTML + readable plain | — | Linked endnotes |
| Export → Markdown | — | `.md` | GFM |
| Export → HTML | — | `.html` | Preview endnotes |
| Export → PDF (print) | — | via browser | Preview endnotes |
| Export → Word | — | `.docx` | Word footnotes (Pandoc) |
| Export → PDF (Pandoc) | — | `.pdf` | Engine footnotes |

`text/plain` on the HTML copies is a readable rendering of the HTML,
never the markdown source.

## Substack checklist and helper

Publish → **Substack** scans the essay and lists only what will
not survive a plain paste. Each item is a checkbox: checked leaves a marker
the helper finishes; unchecked pastes a static fallback that reads fine on
its own.

| Item | Checked (helper finishes it) | Unchecked (static) |
| --- | --- | --- |
| Footnotes | `[1]` markers + Notes list → `insertFootnote()` | `¹` numbers + Notes list |
| Images | pasted; helper reports any still hosted outside Substack | left out, upload by hand |
| Superscript / subscript | `{sup:27}` / `{sub:2}` → Substack marks | Unicode `²⁷` where possible |
| Display math | `$$…$$` paragraph → Substack LaTeX block | LaTeX source in a code block |
| Poetry | `{poetry}` … `{/poetry}` → Substack poem block | stanzas with line breaks and indents |

Informational rows (no checkbox): inline math (Substack has none; pastes
as `$…$`), tables (Substack has none; the paste flattens), and image
warnings — BlogIDE uploads use signed links that expire in about a day,
embedded `data:` images may not paste, relative paths never load.

KaTeX HTML is never pasted: it comes out as duplicated text. Every
non-HTML copy uses the LaTeX source. Poems are split into `<br>` lines with
no-break-space indents because pasted HTML collapses `pre-wrap` newlines.

Steps:

1. Tick what you want, then **Copy text with markers (and images)**.
2. Paste into a Substack draft (the title field stays separate).
3. **Copy helper script**, open DevTools on that tab (F12) → Console,
   paste, Enter. Or save **Copy bookmarklet** as a bookmark URL.

The helper is one script (one bookmarklet) that runs five independent
passes, each in its own `try`, so one failure does not stop the rest:
superscripts → LaTeX → poetry → footnotes → image audit. Each pass only
acts on markers that are present, so unchecked items are left alone, and
the Notes list is only removed after footnotes were actually inserted. It
ends with one alert saying what it did per item.

Substack’s node names for LaTeX and poem blocks are not documented, so the
helper looks them up by name at run time (`/latex|math|equation/`,
`/poe|verse/`) and reports what it found. If one is missing, markers are
removed and the content stays readable (`$$…$$` text, line-broken
paragraphs). If `insertFootnote` is missing, it says so and leaves the
`[1]` markers.

Markers HTML is paste-sanitized for Substack: `<sup>` / `<sub>` never
paste as tags (Substack otherwise drops the whole blockquote), blockquotes
are flattened, and each Notes item is flattened to one paragraph so a path
URL on its own line does not split the item and shift later numbers. The
footnote pass ignores `[n]` inside the Notes section, code, and `$$`
paragraphs (`\sqrt[3]{x}`).

## Pandoc

Self-host only. Typical Vercel images do not include the binary.

The Docker image (`docker compose up`, see the README) ships Pandoc 3.8 and
Typst with `PANDOC_PATH` and `PANDOC_PDF_ENGINE=typst` already set, so
nothing below is needed there. On a Node host:

```bash
# Debian/Ubuntu
sudo apt install pandoc texlive-xetex   # Word + PDF (xelatex)
# or: sudo apt install pandoc weasyprint

# macOS
brew install pandoc basictex            # then eval "$(/usr/libexec/path_helper)"
# or: brew install pandoc weasyprint
```

In `.env.local`:

```bash
PANDOC_PATH=/usr/bin/pandoc
# Optional. If unset, BlogIDE tries xelatex, lualatex, pdflatex, weasyprint, typst.
PANDOC_PDF_ENGINE=xelatex
```

Restart `next dev` after changing env. Then:

- Export → Word (`.docx`)
- Export → PDF (Pandoc)
- Files panel: import `.docx` / `.odt`

CLI equivalents if you would rather convert a downloaded `.md` yourself:

```bash
pandoc essay.md -f markdown+footnotes+pipe_tables -t docx -o essay.docx
pandoc essay.md -f markdown+footnotes+pipe_tables --pdf-engine=xelatex -o essay.pdf
```

Word/PDF via Pandoc is a server conversion (rate-limited). PDF (print)
never leaves the browser.
