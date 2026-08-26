# BlogIDE among writing apps

BlogIDE is an **essay IDE**: a browser workspace for drafting blogs and
essays that should feel like a document editor, stay portable markdown, and
still help with research, footnotes, and getting the piece onto Substack,
Medium, HTML, or a personal site.

It is not a second brain, a novel compiler, a CMS, or a reference manager.
Those products exist and are better at their jobs. This note is a map of
that neighborhood: what to borrow, what not to become, and where to push.

There is **no fork or “improved BlogIDE.”** The public repo is MIT, early,
and currently unforked. The useful cousins are other writing tools, not
drop-in replacements.

## Snapshot

| Tool | Open source? | Home | Strength | Weak for BlogIDE’s job |
| --- | --- | --- | --- | --- |
| **BlogIDE** | MIT | Browser, local-first + optional Supabase | WYSIWYG with GFM round-trip, first-class footnotes, research pins, publish ramps | No corkboard, no graph, thin citations today |
| **Obsidian** | No (free personal) | Local vault + plugins | Linked notes, graph, huge plugin scene, citations *if you assemble them* | Not a publication editor; footnotes and Substack/Medium are afterthoughts |
| **Scrivener** | No (paid) | Desktop | Binder, corkboard, compile for books | Not markdown-native; citations are a scan/export dance |
| **Zettlr** | GPL | Desktop | Native Zotero / CSL / Pandoc for papers | Source-first academic workbench, not a blog WYSIWYG |
| **Ulysses / iA Writer / Bear** | No | Apple (mostly) | Beautiful focused prose | Closed, weak research/footnote/publish story |
| **Ghost / WordPress / Substack / Medium** | Mixed | Web CMS | Hosting and audience | Writing UX is the *destination*, not the studio |
| **Manuskript / novelWriter / bibisco** | Yes | Desktop | Scrivener-shaped fiction | Novels, not essays-with-notes |
| **Joplin / Logseq / Affine / AppFlowy** | Yes | Notes / Notion-like | Knowledge bases | Not essay publication |
| **Mark Text / Apostrophe / Ghostwriter** | Yes | Desktop markdown | Simple source editors | No workspace, footnotes-as-product, or publish pipeline |
| **Overleaf / Quarto** | Mixed | TeX / computational docs | Journals, code, bibliographies | Wrong format for a blog |

## Obsidian

Obsidian is a **local markdown knowledge base**. The unit of work is a vault
of notes with `[[wikilinks]]`, backlinks, and a graph. Live Preview is
close to WYSIWYG, but the soul of the app is the network of notes, not a
single essay on its way to a magazine.

Citations exist through community plugins (Citations, Pandoc, various
Zotero bridges). You can make that stack excellent. You also have to
install, style, and maintain it. Footnotes work as GFM syntax; they do not
get a sidenote rail, pin/drag cards, deleted-note archive, or Substack
paste repair.

**Take:** do not chase the graph, daily notes, or a plugin marketplace.
Lean into the thing Obsidian users still leave the vault for: finishing a
public essay with notes, sources, and a paste target that does not mangle
them.

## Scrivener

Scrivener is a **manuscript studio**. The binder, corkboard, and Compile
pipeline are unmatched for novels and books that need to be reshaped from
scenes. Research lives in the project as snapshots and imports, not as a
live library.

Citations are not first-class. Typical flow is write with placeholders,
then scan with Bookends, Zotero, or EndNote at compile time. The file
format is proprietary. Markdown is an export, not the source of truth.

**Take:** BlogIDE already has a project tree (folders, essays, links,
Library). That is enough “binder” for blogs. A corkboard, character sheets,
and a compile dialect would pull the product toward fiction and away from
markdown portability. Keep the Files tree, pop-out documents, and pins;
skip Scrivener Compile.

## Zettlr (closest open-source cousin)

[Zettlr](https://zettlr.com/) is the honest academic analog: markdown
files on disk, `@citekey` autocomplete from Zotero / JabRef / Juris-M,
9,000+ CSL styles, Pandoc export to the journal’s template. It is a
publication workbench for papers.

It is **not** an improved BlogIDE. It is source-oriented, desktop-only,
and optimized for Pandoc citations (`[@doe2024]`) rather than Chicago
footnotes in a rich essay. Blog writers who think in superscripts and
sidenotes will fight it.

**Take:** steal the *integration posture* (Zotero stays the library of
record; the editor only searches, cites, and formats). Do not steal the
`[@key]` document model as the happy path. Blogs want a readable footnote
in the markdown, not a citekey that only resolves at export. See
[CITATIONS.md](./CITATIONS.md).

## Other open-source writing apps

**Fiction / Scrivener-shaped**

- [Manuskript](https://www.theologeek.ch/manuskript) — binder, cards,
  characters, plots. GPL. The usual “open-source Scrivener” answer.
- [novelWriter](https://novelwriter.io/) — plain-text novel projects,
  outlines, recently better footnotes. Still a book tool.
- bibisco — novel architecture (characters, conflicts).

**Notes / PKM**

- Joplin, Logseq, SiYuan, Affine, AppFlowy, Standard Notes, Trilium,
  SilverBullet. Capable, sometimes self-hosted, aimed at notes or
  Notion-like docs. None of them treat GFM footnotes plus Substack/Medium
  as a product surface.

**Markdown editors**

- Mark Text, Apostrophe (GNOME), Ghostwriter, Hedgedoc (collab). Fine
  source editors. No IDE workspace, no research Library, no footnote rail.

**Academic / docs-as-code**

- Pandoc + any editor, Quarto, Overleaf, Typst. Correct for papers and
  computational books. Wrong default for a blog with sidenotes.

**Libraries, not products**

- TipTap / ProseMirror, Milkdown, MDXEditor. BlogIDE already picked
  TipTap and should keep deepening it (roadmap: do not replace the
  editor core).

If someone wants “BlogIDE but more X,” they will almost always mean
Zettlr (citations), Obsidian (notes graph), Scrivener (structure), or
Ghost (hosting). Those are complements, not forks to merge.

## Commercial writing apps (short)

- **Ulysses** — Apple library of sheets, markdown-ish, nice export. Closed.
- **iA Writer** — focused markdown, content blocks. Closed.
- **Bear** — notes with backlinks on Apple. Closed.
- **Typora** — pretty WYSIWYG markdown; source available only in a limited
  sense, not a self-hostable workspace.
- **Craft, Notion, Google Docs** — collaboration and docs, not portable
  GFM essays with a footnote rail.

BlogIDE’s opening is the overlap those miss: **open, self-hostable,
WYSIWYG, markdown-true, footnote-native, research-beside-the-essay,
publish-aware.**

## What BlogIDE provides that the rest do not

The combination matters more than any single checkbox.

1. **WYSIWYG with a markdown contract.** TipTap in the browser, source
   toggle, and CI that demands
   `serialize(parse(md)) === md` for supported constructs. Obsidian and
   Zettlr are files-first; Scrivener is a binary project; Docs is HTML.
2. **Footnotes as a writing environment.** Inline atoms, sidenote rail or
   collapsed strip, pin/drag cards, deleted-note archive, Substack paste
   repair, find-in-notes. Other apps have GFM `[^1]` or a compile-time
   endnote. Almost none make the *margin* a first-class editor.
3. **Honest publish ramps.** Copy for Substack / Medium / HTML, a helper
   for native Substack notes, pre-publish link/image check, Pandoc Word/PDF
   as optional. The docs say what paste *cannot* do. Vault apps stop at
   “export markdown.” CMSes start after the draft is already done.
4. **An IDE shell for one essay.** Files tree, Outline, footnote rail,
   Library (PDFs + bookmarks), pop-outs and pins, Shell/Notes capture, BYOK
   AI, GitHub as backup rather than source of truth. That layout is closer
   to a code IDE than to iA Writer or to Notion.
5. **Local-first, self-hostable cloud.** IndexedDB + optimistic Supabase,
   quota, conflict copies, MIT. Obsidian Sync is paid and closed; Scrivener
   is a disk project; most markdown editors have no account model at all.
6. **Research without a second brain.** Link hover, Pin, reader extract,
   cloud Library under the same quota as essay images. Optional
   fetch(bible) is the same idea: a writing-time integration, not a new
   app inside the app.
7. **Thin Cite already exists.** Paste BibTeX → Chicago/MLA plain text →
   footnote or caret. That is the seed. It is not a library yet
   ([CITATIONS.md](./CITATIONS.md)).

## Lean into

Stay the **studio for a public essay**.

- Footnotes, sidenotes, and Chicago-style humanities blogging.
- Research *while writing*: pins, Library, Outline, and a Cite rail that
  talks to Zotero instead of replacing it.
- Markdown as the file you can leave with (personal-site, GitHub, Pandoc).
- Publish targets as exit ramps, with the limitations documented.
- Opt-in integrations in Settings (GitHub, AI keys, fetch.bible, later
  Zotero) that keep secrets on the device.
- Self-host as a first-class path, hosted as a convenience.

## Do not become

| Temptation | Why not |
| --- | --- |
| Obsidian (graph, wikilinks, daily notes, plugins) | Splits attention from finishing one essay; PKM products already won |
| Scrivener (corkboard, Compile, fiction metadata) | Fights the markdown round-trip; wrong unit of work |
| Zotero / JabRef (full reference manager) | Collections, PDFs, tags, sync, CSL debugging are a product of their own |
| Ghost / WordPress (CMS, themes, audience) | Hosting is downstream; BlogIDE should *hand off* a clean draft |
| Overleaf (LaTeX, collab paper) | Different document model |
| Notion (blocks, databases, teams) | Portability dies |

## Address later (product gaps)

These are real holes relative to the neighborhood. They are also a
priority list, not a dare to clone everyone.

**Citations.** The Cite dialog is paste-only. Zettlr and a well-plugin’d
Obsidian beat BlogIDE here. The Cite rail + Zotero/BibTeX spec is
[CITATIONS.md](./CITATIONS.md). This is the highest-leverage “academic
blog” gap.

**Long-form structure.** Scrivener still wins at rearranging a book.
BlogIDE can grow *light* structure (Outline already exists; maybe
per-essay sections or a “parts” folder convention) without a corkboard.

**Mobile.** Phone today is a terminal-style Notes capture. Fine for
scraps, weak for drafting the essay itself.

**Collaboration.** Docs/Notion/Hedgedoc win. Out of scope until the
single-author loop is boringly solid.

**Offline desktop Zotero.** The web API is the right v1 for a hosted
app. A later Electron/Tauri shell could talk to `127.0.0.1:23119`.

**CSL completeness.** Do not ship a second citeproc if Zotero will format
the note. Keep the local BibTeX formatter small for the no-Zotero path.

**Sync and quota UX.** Local-first is a differentiator only if conflict
copies and the 10 MiB hosted ceiling stay understandable.

**Discoverability.** Help, shortcuts, and Settings have grown. A focused
essay IDE should stay quieter than Obsidian, not grow a command palette
for its own sake.
