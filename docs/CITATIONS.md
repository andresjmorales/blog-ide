# Citations: Zotero and BibTeX (design)

Friendly integration for citing while writing a blog or essay. Zotero
(and a `.bib` file) stay the libraries of record. BlogIDE searches,
inserts, copies, and remembers what this essay used.

This is **not** a Zotero clone, a CSL workshop, or a JabRef replacement.
It is the same class of feature as fetch(bible) and GitHub backup: an
opt-in side tool in the writing surface.

Status: **design only.** Today the app has a thin **Cite** dialog
(`CitationInsertDialog`) that pastes one BibTeX entry, formats Chicago or
MLA in `lib/citations/formatBibtex.ts`, and inserts a footnote or caret
text. Keep that path until the rail lands.

Earlier note (easy-wins roadmap): “Overleaf-ish bibliography without
becoming Zotero” and a **Cite rail beside Outline / Footnotes**. This spec
keeps that UI home and adds a live Zotero library link, which that note
had deferred.

## Goal

From inside an essay, a writer can:

1. Search their existing Zotero library (or a pasted / attached `.bib`).
2. Insert a **Chicago note** (default) as a BlogIDE footnote, or copy that
   formatted string to the clipboard.
3. See which sources this essay already cites, jump to those marks, and
   re-copy / re-insert without leaving the editor.
4. Keep doing all of that when Zotero is disconnected, using the
   snapshots attached to the essay.

The markdown that leaves BlogIDE remains a normal GFM essay: readable
footnotes, not `[@doe2024]` placeholders that only resolve in Pandoc.

## Non-goals (v1)

Do not build:

- Collections, tags, feeds, or trash management
- A PDF reader, annotator, or metadata editor
- Two-way sync of the full library into Supabase or IndexedDB
- Writing new items back to Zotero (no “save this URL as a Zotero item”)
- A full citeproc / 9,000-style CSL picker
- Pandoc-style `[@citekey]` as the document source of truth
- Better BibTeX citekey management (optional later)
- The Zotero desktop local API (`127.0.0.1:23119`) as the hosted-web
  happy path (desktop shell can add it later)
- A Cite **workspace dock** (`PanelId` like Files / AI / Library). Cite
  lives in the **editor column**, with Outline and Footnotes.

Zotero desktop remains the place to add books, attach PDFs, and fix
metadata. BlogIDE only consumes.

## Where it lives in the UI

### Editor column (same family as Outline and Footnotes)

```
[ Outline ] [ Cite ] |  essay  | [ Footnotes ]
```

- **Outline** stays the left rail (`DocumentOutline`, `.doc-outline`).
- **Cite** is a sibling left rail with the same collapse language:
  slim vertical label when closed, ~13.5rem panel when open, caret
  toggle, `border-right`.
- **Footnotes** stay the right rail (`SidenoteRail`). Cite is *not* a
  tab inside Footnotes. Notes are the essay’s own text; Cite is a
  source picker that often *creates* a note.

Default: Outline open (current), Cite collapsed. Opening both splits the
left column vertically (Outline on top, Cite below, drag handle) so the
essay does not grow a fourth full-height column. On the phone-width
layout where Outline/Footnotes already hide, Cite is a full-screen sheet
from the toolbar Cite button (same as today’s dialog, plus search).

Toolbar **Cite** keeps working: it opens the rail if there is room, or
the sheet on a narrow viewport. Escape / the caret closes it. Do not
leave a second modal stacked on the rail.

### Settings → Integrations

Match fetch(bible) and GitHub:

- **Zotero** section, off until a key is saved.
- Fields: User ID (or Group ID), API key, library kind (user / group).
- Link to [zotero.org/settings/keys](https://www.zotero.org/settings/keys)
  with copy that says: create a key with **library read** only; BlogIDE
  never writes items.
- Keys stay in `localStorage` (`blogide.zotero.apiKey`), never Supabase,
  never a BlogIDE env var. Same comments as `lib/github/token.ts` and
  `lib/ai/keys.ts`.
- Optional default citation style: Chicago note (default), Chicago
  bibliography, MLA. Seed from existing `prefs.dashStyle` (`chicago` |
  `mla`) but allow a Cite-specific override.

### What the rail contains

**Search.** One box. Debounced query against Zotero when connected,
plus the essay’s attached bibliography and any session-imported `.bib`.
Empty state: “Connect Zotero in Settings, paste BibTeX, or drop a `.bib`.”

**Results.** Compact rows: creators, year, title, item type. No thumbnails,
no extra metadata editor. Click to expand a preview of the formatted
Chicago note (and BibTeX, collapsed).

**This essay.** A list of sources already used in the open document
(see Tracking). Click jumps to the footnote mark, like Outline jumps to
a heading.

**Actions on a result (always visible, no hamburger odyssey):**

- **Insert footnote** — default. Formats as Chicago *note* and
  `insertFootnote(text)`.
- **Copy** — same string to the clipboard (plain text; HTML optional).
- **Insert at caret** — in-body text, not a note (today’s dialog
  checkbox). Secondary.
- **BibTeX** — copy the raw entry (Zotero `format=bibtex` or the local
  `.bib` slice).

Do not offer “open in Zotero” as a required control. A small
`zotero://select/items/…` link is fine when the key is present; it no-ops
without the desktop app.

## Mental model

```
Zotero (or .bib)     BlogIDE essay              Publish
────────────────     ─────────────              ───────
library of record    formatted footnote         Substack / Medium / HTML
metadata, PDFs       + small attached index     still just GFM notes
```

Zotero’s Web API can format citations itself
(`include=citation&style=chicago-note-bibliography`, default style on
the API is already Chicago notes). Prefer that over reimplementing CSL.
The local `formatBibtex.ts` helper stays for pasted BibTeX and for
offline fallback. It is allowed to be incomplete (article / book / misc).
It is not allowed to become citeproc.

## User flows

### A. Zotero connected (primary)

1. Settings → Integrations → paste User ID + API key (read-only).
2. Open Cite rail, type “Nussbaum”.
3. Pick the book. Preview shows the Chicago note.
4. **Insert footnote** puts a `[^n]` at the caret with that note body.
5. The essay’s attached bibliography gains a snapshot (key, formatted
   strings, bibtex). Quota sees a few kilobytes of markdown, not a PDF.

### B. No Zotero yet (already ships, stays)

1. Toolbar Cite or rail → paste `@book{…}`.
2. Format with the local helper.
3. Insert footnote / caret. Same attached snapshot, `source: "bibtex"`.

### C. Clipboard only

Writer is in another app. **Copy** puts the Chicago note on the clipboard
without touching the essay. Useful for emails, Substack when they insist
on typing the note there, or quoting a source in a footnote they already
opened.

### D. Offline / key missing

Search the attached bibliography and any `.bib` imported this session.
Zotero rows that were never used in this essay are not available (we
never mirrored the library). Empty search explains that.

## Data

### Device-local (secrets and session)

```
localStorage:
  blogide.zotero.apiKey
  blogide.zotero.userId
  blogide.zotero.libraryType    "user" | "group"
  blogide.zotero.groupId        if group
  blogide.zotero.style          "chicago-note-bibliography" | "modern-language-association" | …

session / memory:
  last search hits (do not persist the library)
```

Optional IndexedDB cache of recent search hits is allowed for snappy
reopen, capped (e.g. 200 items), and never synced. It is a cache, not a
second Zotero.

### Per-essay (portable, in the markdown)

Do **not** store the library in `library_items` / Storage. That quota is
for PDFs and bookmarks the writer chose to keep in BlogIDE.

Do store a **small index** of sources this essay actually used, in the
same spirit as deleted-footnote comments
(`lib/markdown/deletedFootnotes.ts`):

```html
<!--blogide-citations:[{"id":"ABCD2345","provider":"zotero","citeKey":"nussbaum2011","title":"Creating Capabilities","formatted":{"chicago-note":"Martha C. Nussbaum, *Creating Capabilities* (Cambridge, MA: Harvard University Press, 2011)."},"bibtex":"@book{nussbaum2011,...}"}]-->
```

Rules:

- Appended at the end of the document, like deleted footnotes.
- Must survive the round-trip tests. If the HTML comment is too brittle
  inside TipTap, put the same JSON in a reserved frontmatter key
  (`citations:`) edited only through the Cite rail, preserving the
  “never parse-dump unknown YAML” rule for everything else.
- The **footnote body is the human copy.** If the comment is stripped,
  the essay still reads correctly. The index is for restyle, jump-to,
  and offline re-copy.
- Do not rewrite footnote text on every Zotero sync. Snapshots freeze at
  insert. A later “Refresh from Zotero” can be an explicit row action.

Citekeys (`nussbaum2011`) are best-effort: Zotero extra / citation key
if present, else a slug from creator+year+title. They are labels, not
Pandoc identifiers.

### What we send to Zotero

Read-only Web API v3 (`https://api.zotero.org`):

| Call | Why |
| --- | --- |
| `GET /users/{id}/items?q=&qmode=titleCreatorYear&itemType=-attachment&include=data,citation,bibtex&style=chicago-note-bibliography&limit=25` | Search |
| same on `/groups/{id}/items` | Group libraries |
| `GET /…/items/{key}?include=data,citation,bibtex&style=…` | One item, insert |

`Authorization: Bearer <key>` (or `Zotero-API-Key`). CORS is enabled on
`api.zotero.org`, so the **browser can call Zotero directly**, like
GitHub’s browser PAT. No BlogIDE server proxy unless a future CSP/egress
policy forbids it. If a proxy is added, it must be a thin pass-through
that does not log or store the key (same as `/api/ai/chat`).

Always `itemType=-attachment` so PDFs and snapshots do not clutter
results. Skip notes (`itemType=-note || -attachment`) if the extra
filter stays readable.

Do not paginate the whole library into the client.

## Formatting

Priority:

1. **Zotero-formatted** `citation` HTML → strip to markdown-ish plain
   text (`*italics*`, quotes, en dashes) so the footnote matches the
   editor’s Chicago/MLA punctuation prefs.
2. Else Zotero `format=bibtex` → existing `formatBibEntry`.
3. Else local parse of pasted BibTeX.

Default style: **Chicago notes**. That is the blog/essay case and
Zotero’s API default. MLA is the other first-class option because
Cleanup already has a Chicago/MLA dash pref. APA can wait.

Inserting as a footnote uses `editor.commands.insertFootnote(text)`,
already wired in the dialog. Multiple Zotero picks in one action insert
one footnote each, in list order.

Chicago *bibliography* (works cited) is a later rail action: append a
“Works cited” heading plus `include=bib` strings, or copy that block.
Do not auto-append it. Chicago-note essays often do not want a list.

## Markdown and publish

- Footnote bodies stay GFM (`[^n]` / `[^n]: …`). Substack/Medium copy
  behavior is unchanged ([PUBLISH_EXPORT.md](./PUBLISH_EXPORT.md)).
- Do not introduce `[@citekey]` in the rich-text schema.
- The citations comment is BlogIDE-only, same as
  `<!--blogide-deleted-footnotes:…-->`. Personal-site and GitHub copies
  can ignore it; the visible notes remain.
- AI prompts already say “do not invent citations.” When the rail
  exists, the model still must not add fake `blogide-citations` entries.

## Tracking “used in this essay”

A used source is one of:

- a row in the citations comment, or
- a footnote whose body matches a stored `formatted` string.

The rail’s **This essay** list is that set, ordered by first footnote
number. Jump uses the same scroll helper as Outline
(`scrollHeadingIntoView` analog for `footnoteRef`).

If the writer edits the footnote by hand, leave it. Do not fight the
prose. Mark the row as “edited” if the body no longer matches the
snapshot; Refresh is opt-in.

## Files to grow (when implementing)

| Piece | Likely home |
| --- | --- |
| Zotero token + ids | `lib/zotero/token.ts` (clone GitHub token helpers) |
| Web API client | `lib/zotero/client.ts` (search, get, strip bib HTML) |
| Cite rail UI | `components/CiteRail.tsx` next to `DocumentOutline.tsx` |
| Layout | `components/DocumentEditor.tsx` left of the essay |
| Essay index parse/serialize | `lib/markdown/essayCitations.ts` + fixture |
| Keep | `lib/citations/formatBibtex.ts`, toolbar Cite |
| Settings | `components/SettingsPanel.tsx` Integrations |
| Tests | search client (mocked fetch), comment round-trip, insert footnote |

No new `PanelId`. No Storage bucket. No schema migration unless
frontmatter-only storage is chosen instead of the HTML comment.

## Phasing

**P0 — Rail without Zotero.** Move the dialog into the Cite rail.
Paste BibTeX, style picker, insert footnote / copy / caret. Attach the
essay index. This already makes Cite feel like Outline/Footnotes.

**P1 — Zotero read.** Settings key, search, Zotero-formatted Chicago
note, insert/copy. This is the feature people mean by “integration.”

**P2 — This essay + refresh.** Jump to marks, edited-state, explicit
refresh from Zotero, copy works-cited block.

**P3 — Optional extras (only if P1 is boring).** Drop a `.bib` into
the rail for the session; DOI/ISBN/URL → BibTeX via Citation.js +
Crossref (the old “later” line); group libraries; `zotero://select`;
Better BibTeX keys if they appear in Extra.

Each phase must keep the round-trip guarantee and must not upload
Zotero PDFs into Library.

## Security and quota

- Read-only key. Document that in Settings.
- Never put the key in query strings, logs, or Supabase `user_settings`.
- Strip HTML from Zotero `citation` / `bib` before insert (no raw
  XHTML in the essay). Reuse the same sanitizing instinct as reader
  extracts.
- Search traffic goes to `api.zotero.org`, not through BlogIDE, unless
  a proxy is required.
- Attached snapshots are text. They count toward markdown quota like
  any other characters. That is the point: a few KB, not a mirrored
  library.

## Why this is still “not Zotero”

Zotero: own the record, files, collections, CSL, sync.
BlogIDE: own the sentence, the superscript, and the paste target.

The writer should feel that citing is as close as the Outline: search,
insert a Chicago footnote, keep typing. Fixing a publisher field still
happens in Zotero.
