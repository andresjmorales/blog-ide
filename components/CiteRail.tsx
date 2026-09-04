"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/react";
import { PanelCaret } from "@/components/icons";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import {
  CITE_STYLE_LABELS,
  citeStyleFromDashPref,
  type CiteStyleId,
} from "@/lib/citations/citeStyle";
import { copyPlainText } from "@/lib/citations/clipboard";
import {
  listEssayLinkedUrls,
  type EssayLinkedUrl,
} from "@/lib/citations/essayLinks";
import {
  citationsSnapshotEqual,
  displayFormatted,
  listUsedEssaySources,
  pruneEssayCitations,
  worksCitedBlock,
  type UsedEssaySource,
} from "@/lib/citations/essaySources";
import {
  insertCitationAtCaret,
  insertCitationFootnote,
  readEssayCitations,
  rewriteFootnoteContent,
  scrollFootnoteIntoView,
  updateCitationSnapshot,
  writeEssayCitations,
} from "@/lib/citations/insertCitation";
import {
  citationFromHit,
  hitCanCite,
  hitFromEssayCitation,
  hitFromZotero,
  hitKindLabel,
  hitsFromBibtex,
  listBrowseHits,
  listSearchHits,
  mergeHits,
  type CiteHit,
} from "@/lib/citations/localHits";
import {
  addUrlToZotero,
  getZoteroItem,
  searchZoteroItems,
  zoteroErrorCopy,
  zoteroSelectHref,
  type ZoteroSearchHit,
} from "@/lib/zotero/client";
import {
  isZoteroConnected,
  loadZoteroConfig,
  saveZoteroConfig,
  ZOTERO_CONFIG_EVENT,
  type ZoteroConfig,
} from "@/lib/zotero/token";
import { hitFromLibraryEntry } from "@/lib/citations/libraryCite";
import {
  getEssayEditor,
  subscribeEssayEditor,
} from "@/lib/citations/essayEditor";
import { OPEN_LIBRARY_CITE_EVENT } from "@/lib/citations/openLibraryCite";
import { canonicalizeLibraryUrl } from "@/lib/library/urls";
import {
  addLibraryLinkDurable,
  findLibraryLinkByUrl,
  getLibraryServerSnapshot,
  listLibraryEntries,
  removeLibraryEntryDurable,
  resolveLibraryPdfSrc,
  subscribeLibrary,
  type LibraryMeta,
} from "@/lib/library/sessionLibrary";
import { openLinkPin, openPdfPin } from "@/lib/pins/pinStore";
import { showErrorToast, showSuccessToast, showToast } from "@/lib/ui/toast";
import { useSyncExternalStore } from "react";

const SEARCH_DEBOUNCE_MS = 320;

type Props = {
  editor: Editor;
  open: boolean;
  onToggle: () => void;
  variant?: "rail" | "sheet";
};

export function CiteRail({
  editor,
  open,
  onToggle,
  variant = "rail",
}: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (
        variant === "rail" &&
        target instanceof HTMLElement &&
        !target.closest(".cite-rail")
      ) {
        return;
      }
      event.preventDefault();
      onToggle();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onToggle, variant]);

  const body = <CitePanel editor={editor} />;

  if (variant === "sheet") {
    if (!open) return null;
    return (
      <div className="cite-sheet">
        <button
          type="button"
          className="cite-sheet-backdrop"
          aria-label="Close"
          onClick={onToggle}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="cite-sheet-panel"
        >
          <header className="cite-sheet-header">
            <h2 id={titleId}>Cite</h2>
            <button type="button" className="cite-sheet-close" onClick={onToggle}>
              ×
            </button>
          </header>
          {body}
        </div>
      </div>
    );
  }

  return (
    <aside
      className={`cite-rail ${open ? "is-open" : ""}`}
      aria-label="Citations"
    >
      <button
        type="button"
        className="cite-rail-toggle"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? "Hide citations" : "Show citations"}
      >
        <span className="cite-rail-toggle-label">Cite</span>
        <PanelCaret direction={open ? "left" : "right"} />
      </button>
      {open && body}
    </aside>
  );
}

export function CitePanel({
  editor: editorProp,
  afterResults,
}: {
  editor?: Editor | null;
  afterResults?: ReactNode;
}) {
  const storeEditor = useSyncExternalStore(
    subscribeEssayEditor,
    getEssayEditor,
    () => null
  );
  const editor = editorProp ?? storeEditor;
  const { prefs } = useEditorPrefs();
  const [config, setConfig] = useState<ZoteroConfig>(() => loadZoteroConfig());
  const [style, setStyle] = useState<CiteStyleId>(
    () => loadZoteroConfig().style || citeStyleFromDashPref(prefs.dashStyle)
  );
  const [query, setQuery] = useState("");
  const [zoteroHits, setZoteroHits] = useState<CiteHit[]>([]);
  const [sessionHits, setSessionHits] = useState<CiteHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(true);
  const [pasteSource, setPasteSource] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [citationsTick, setCitationsTick] = useState(0);
  const [linksOpen, setLinksOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [zoteroByUrl, setZoteroByUrl] = useState<Record<string, ZoteroSearchHit>>(
    {}
  );
  const searchGen = useRef(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const libraryEntries = useSyncExternalStore(
    subscribeLibrary,
    listLibraryEntries,
    getLibraryServerSnapshot
  );

  const connected = isZoteroConnected(config);

  useEffect(() => {
    function refresh() {
      const next = loadZoteroConfig();
      setConfig(next);
      setStyle(next.style || citeStyleFromDashPref(prefs.dashStyle));
    }
    window.addEventListener(ZOTERO_CONFIG_EVENT, refresh);
    return () => window.removeEventListener(ZOTERO_CONFIG_EVENT, refresh);
  }, [prefs.dashStyle]);

  useEffect(() => {
    if (!editor) return;
    const bump = () => setCitationsTick((n) => n + 1);
    const pruneIfNeeded = () => {
      const current = readEssayCitations(editor);
      const next = pruneEssayCitations(current, editor.state.doc);
      if (!citationsSnapshotEqual(current, next)) {
        writeEssayCitations(editor, next);
      }
    };
    pruneIfNeeded();
    editor.on("update", bump);
    editor.on("transaction", bump);
    return () => {
      editor.off("update", bump);
      editor.off("transaction", bump);
    };
  }, [editor]);

  useEffect(() => {
    function focusSearch() {
      window.setTimeout(() => searchRef.current?.focus(), 40);
    }
    window.addEventListener(OPEN_LIBRARY_CITE_EVENT, focusSearch);
    return () => window.removeEventListener(OPEN_LIBRARY_CITE_EVENT, focusSearch);
  }, []);

  void citationsTick;
  const essayCitations = editor ? readEssayCitations(editor) : [];
  const used = editor
    ? listUsedEssaySources(essayCitations, editor.state.doc, style)
    : [];
  const linkedUrls = editor ? listEssayLinkedUrls(editor.state.doc) : [];
  const essayHits = essayCitations.map((citation) =>
    hitFromEssayCitation(citation, style)
  );
  const libraryHits = libraryEntries.map(hitFromLibraryEntry);

  function zoteroHitForUrl(url: string | undefined): ZoteroSearchHit | undefined {
    if (!url) return undefined;
    const key = canonicalizeLibraryUrl(url) ?? url.trim();
    return zoteroByUrl[key];
  }

  async function addToZotero(id: string, url: string, title?: string) {
    if (!connected) return;
    setAddingId(id);
    try {
      const result = await addUrlToZotero(config, { url, title }, style);
      const key = canonicalizeLibraryUrl(url) ?? url.trim();
      setZoteroByUrl((prev) => ({ ...prev, [key]: result.hit }));
      showSuccessToast(
        result.created ? "Added to your Zotero library." : "Already in your Zotero library.",
        undefined,
        "cite-zotero-add"
      );
    } catch (err) {
      showErrorToast(zoteroErrorCopy(err, "write"), "Could not add to Zotero.", "cite-zotero-add");
    } finally {
      setAddingId((current) => (current === id ? null : current));
    }
  }

  async function addToLibrary(url: string, title?: string) {
    try {
      await addLibraryLinkDurable({ url, title });
      showSuccessToast("Saved to Library.", undefined, "cite-library-add");
    } catch (err) {
      showErrorToast(err, "Could not add that link.", "cite-library-add");
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (!q || !connected) return;
    const gen = ++searchGen.current;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchZoteroItems(config, q, style)
        .then((items) => {
          if (gen !== searchGen.current) return;
          setZoteroHits(items.map(hitFromZotero));
        })
        .catch((err) => {
          if (gen !== searchGen.current) return;
          setZoteroHits([]);
          showErrorToast(zoteroErrorCopy(err), "Zotero search failed.", "cite-zotero-search");
        })
        .finally(() => {
          if (gen === searchGen.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      searchGen.current += 1;
    };
  }, [query, connected, config, style]);

  const q = query.trim();
  const remoteHits = q && connected ? zoteroHits : [];
  const results = q
    ? listSearchHits(remoteHits, sessionHits, essayHits, libraryHits, q)
    : listBrowseHits(sessionHits, libraryHits);

  function onStyleChange(next: CiteStyleId) {
    setStyle(next);
    saveZoteroConfig({ style: next });
  }

  function importBibtex(source: string) {
    const hits = hitsFromBibtex(source, style);
    if (hits.length === 0) {
      showToast({
        tone: "error",
        message: "No BibTeX entries found. Paste an @article{…} or @book{…}.",
        replaceKey: "cite-bibtex",
      });
      return [];
    }
    setSessionHits((prev) => mergeHits(hits, prev));
    setExpandedId(hits[0]?.id ?? null);
    return hits;
  }

  function onPasteFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text().then((text) => {
      setPasteSource(text);
      importBibtex(text);
      setPasteOpen(true);
    });
  }

  function onDropBib(event: DragEvent) {
    const file = [...event.dataTransfer.files].find((item) =>
      item.name.toLowerCase().endsWith(".bib")
    );
    if (!file) return;
    event.preventDefault();
    void file.text().then((text) => {
      setPasteSource(text);
      importBibtex(text);
      setPasteOpen(true);
    });
  }

  const flashCopied = useCallback((id: string) => {
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
    }, 1400);
  }, []);

  async function copyText(id: string, text: string) {
    const ok = await copyPlainText(text);
    if (ok) flashCopied(id);
    else showErrorToast("Could not copy to the clipboard.", "Could not copy.", "cite-copy");
  }

  return (
    <div
      className="cite-panel"
      onDragOver={(event) => {
        if ([...event.dataTransfer.items].some((item) => item.kind === "file")) {
          event.preventDefault();
        }
      }}
      onDrop={onDropBib}
    >
      <div className="cite-search-row">
        <input
          type="search"
          ref={searchRef}
          className="cite-search"
          placeholder="Search library, Zotero, or this essay"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search citations"
        />
        <label className="cite-style">
          <span className="sr-only">Style</span>
          <select
            value={style}
            onChange={(event) => onStyleChange(event.target.value as CiteStyleId)}
          >
            {(Object.keys(CITE_STYLE_LABELS) as CiteStyleId[]).map((id) => (
              <option key={id} value={id}>
                {CITE_STYLE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="cite-results">
        {searching && q && connected && (
          <p className="cite-empty">Searching Zotero…</p>
        )}
        {!(searching && q && connected) && results.length === 0 && (
          <p className="cite-empty">
            {query.trim()
              ? connected
                ? "No matches in the library, Zotero, or this essay."
                : "No matches here. Connect Zotero in Settings, or paste BibTeX."
              : "Add a PDF or site link, paste BibTeX, or search Zotero."}
          </p>
        )}
        {results.length > 0 && (
          <ul className="cite-hit-list">
            {results.map((hit) => {
              const zoteroHit = hit.zotero ?? zoteroHitForUrl(hit.url);
              return (
              <CiteHitRow
                key={hit.id}
                hit={hit}
                expanded={expandedId === hit.id}
                copied={copiedId === hit.id}
                copiedUrl={copiedId === `${hit.id}:url`}
                connected={connected}
                canCite={Boolean(editor) && hitCanCite(hit)}
                addingToZotero={addingId === hit.id}
                zoteroHit={zoteroHit}
                onToggle={() =>
                  setExpandedId((current) => (current === hit.id ? null : hit.id))
                }
                onInsertFootnote={() => {
                  if (!editor || !hit.formatted || !hitCanCite(hit)) return;
                  insertCitationFootnote(
                    editor,
                    citationFromHit(hit, style),
                    hit.formatted
                  );
                }}
                onInsertCaret={() => {
                  if (!editor || !hit.formatted || !hitCanCite(hit)) return;
                  insertCitationAtCaret(
                    editor,
                    citationFromHit(hit, style),
                    hit.formatted
                  );
                }}
                onCopy={() => void copyText(hit.id, hit.formatted)}
                onCopyUrl={
                  hit.url
                    ? () => void copyText(`${hit.id}:url`, hit.url!)
                    : undefined
                }
                onCopyBibtex={() => void copyText(`${hit.id}:bib`, hit.bibtex)}
                onAddToZotero={
                  connected && hit.url && !zoteroHit
                    ? () => void addToZotero(hit.id, hit.url!, hit.title)
                    : undefined
                }
                onOpen={
                  hit.libraryId || hit.url
                    ? () => void openLibraryHit(libraryEntries, hit)
                    : undefined
                }
                onRemove={
                  hit.libraryId
                    ? () => void removeLibraryEntryDurable(hit.libraryId!)
                    : undefined
                }
              />
              );
            })}
          </ul>
        )}
      </div>

      {afterResults}

      <ThisEssayList
        rows={used}
        style={style}
        connected={connected}
        copiedId={copiedId}
        onJump={(pos) => {
          if (editor) scrollFootnoteIntoView(editor, pos);
        }}
        onCopy={(id, text) => void copyText(id, text)}
        onCopyUrl={(id, url) => void copyText(id, url)}
        onCopyWorksCited={() =>
          void copyText("works-cited", worksCitedBlock(used, style))
        }
        onAddToZotero={
          connected
            ? (row) => {
                const url = row.citation.url;
                if (!url) return;
                void addToZotero(`used:${row.citation.id}`, url, row.citation.title);
              }
            : undefined
        }
        addingId={addingId}
        zoteroByUrl={zoteroByUrl}
        onRefresh={
          connected
            ? async (row) => {
                if (row.citation.provider !== "zotero") return;
                try {
                  const fresh = await getZoteroItem(config, row.citation.id, style);
                  if (!fresh?.citation) {
                    showToast({
                      tone: "error",
                      message: "Zotero had no formatted citation for that item.",
                      replaceKey: "cite-zotero-refresh",
                    });
                    return;
                  }
                  const next = citationFromHit(hitFromZotero(fresh), style);
                  next.footnoteIds = row.citation.footnoteIds;
                  if (editor) {
                    updateCitationSnapshot(editor, next);
                    if (row.footnote) {
                      rewriteFootnoteContent(
                        editor,
                        row.footnote.id,
                        fresh.citation
                      );
                    }
                  }
                } catch (err) {
                  showErrorToast(
                    zoteroErrorCopy(err),
                    "Could not refresh that citation.",
                    "cite-zotero-refresh"
                  );
                }
              }
            : undefined
        }
      />

      <EssayLinksList
        rows={linkedUrls}
        open={linksOpen}
        onToggle={() => setLinksOpen((value) => !value)}
        connected={connected}
        copiedId={copiedId}
        addingId={addingId}
        zoteroByUrl={zoteroByUrl}
        onJump={(pos) => {
          if (editor) scrollFootnoteIntoView(editor, pos);
        }}
        onCopyUrl={(id, url) => void copyText(id, url)}
        onAddToLibrary={(row) => void addToLibrary(row.url, row.title)}
        onAddToZotero={
          connected
            ? (row) => void addToZotero(`link:${row.canonical}`, row.url, row.title)
            : undefined
        }
        inLibrary={(url) => findLibraryLinkByUrl(url) != null}
      />

      <div className="cite-paste">
        <button
          type="button"
          className="cite-paste-toggle"
          aria-expanded={pasteOpen}
          onClick={() => setPasteOpen((open) => !open)}
        >
          Paste BibTeX
        </button>
        {pasteOpen && (
          <>
            <textarea
              className="cite-paste-input"
              value={pasteSource}
              onChange={(event) => setPasteSource(event.target.value)}
              placeholder={`@book{key,\n  author = {Doe, Jane},\n  title = {Example},\n  year = {2024}\n}`}
              spellCheck={false}
            />
            <div className="cite-paste-actions">
              <button
                type="button"
                className="cite-action"
                onClick={() => importBibtex(pasteSource)}
              >
                Add to results
              </button>
              <label className="cite-action cite-file">
                Open .bib
                <input
                  type="file"
                  accept=".bib,application/x-bibtex,text/plain"
                  hidden
                  onChange={onPasteFile}
                />
              </label>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

async function openLibraryHit(
  entries: LibraryMeta[],
  hit: CiteHit
): Promise<void> {
  const entry = hit.libraryId
    ? entries.find((item) => item.id === hit.libraryId)
    : undefined;
  if (entry?.kind === "link" && entry.url) {
    openLinkPin({ url: entry.url, title: entry.name });
    return;
  }
  if (hit.url) {
    openLinkPin({ url: hit.url, title: hit.title });
    return;
  }
  if (!entry) return;
  const src = await resolveLibraryPdfSrc(entry);
  if (!src) return;
  openPdfPin({ src, title: entry.name, revokeOnClose: false });
}

function CiteHitRow({
  hit,
  expanded,
  copied,
  copiedUrl,
  connected,
  canCite,
  addingToZotero,
  zoteroHit,
  onToggle,
  onInsertFootnote,
  onInsertCaret,
  onCopy,
  onCopyUrl,
  onCopyBibtex,
  onAddToZotero,
  onOpen,
  onRemove,
}: {
  hit: CiteHit;
  expanded: boolean;
  copied: boolean;
  copiedUrl: boolean;
  connected: boolean;
  canCite: boolean;
  addingToZotero: boolean;
  zoteroHit?: ZoteroSearchHit;
  onToggle: () => void;
  onInsertFootnote: () => void;
  onInsertCaret: () => void;
  onCopy: () => void;
  onCopyUrl?: () => void;
  onCopyBibtex: () => void;
  onAddToZotero?: () => void;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const kind = hitKindLabel(hit);
  const detail = [hit.creators, hit.year].filter(Boolean).join(" · ");
  return (
    <li className={`cite-hit ${expanded ? "is-expanded" : ""}`}>
      <button
        type="button"
        className="cite-hit-main"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <PanelCaret
          direction="right"
          className="cite-hit-caret"
          size={10}
        />
        <span className="cite-hit-kind">{kind}</span>
        <span className="cite-hit-title">{hit.title}</span>
      </button>
      {expanded && (
        <>
          <div className="cite-hit-preview">
            {detail && <p className="cite-hit-meta">{detail}</p>}
            {kind === "pdf" ? (
              <p className="cite-preview-text">
                Saved PDF. Open it in a pin; it is not a formatted citation.
              </p>
            ) : (
              <p className="cite-preview-text">
                {hit.formatted ||
                  "No formatted citation yet. Paste BibTeX or refresh from Zotero."}
              </p>
            )}
            {hit.bibtex && (
              <details className="cite-bibtex">
                <summary>Raw BibTeX</summary>
                <pre>{hit.bibtex}</pre>
              </details>
            )}
          </div>
          <div className="cite-hit-actions">
            {canCite && (
              <button
                type="button"
                className="cite-action is-primary"
                onClick={onInsertFootnote}
              >
                Insert footnote
              </button>
            )}
            {canCite && (
              <button type="button" className="cite-action" onClick={onCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {onCopyUrl && (
              <button type="button" className="cite-action" onClick={onCopyUrl}>
                {copiedUrl ? "Copied URL" : "Copy URL"}
              </button>
            )}
            {canCite && (
              <button type="button" className="cite-action" onClick={onInsertCaret}>
                Insert at caret
              </button>
            )}
            {hit.bibtex && (
              <button type="button" className="cite-action" onClick={onCopyBibtex}>
                BibTeX
              </button>
            )}
            {onOpen && (
              <button type="button" className="cite-action" onClick={onOpen}>
                Open
              </button>
            )}
            {onAddToZotero && (
              <button
                type="button"
                className="cite-action"
                disabled={addingToZotero}
                onClick={onAddToZotero}
              >
                {addingToZotero ? "Adding…" : "Add to Zotero"}
              </button>
            )}
            {zoteroHit && connected && (
              <a className="cite-zotero-link" href={zoteroSelectHref(zoteroHit)}>
                Open in Zotero
              </a>
            )}
            {onRemove && (
              <button
                type="button"
                className="cite-action cite-action-danger"
                onClick={onRemove}
              >
                Remove
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function ThisEssayList({
  rows,
  style,
  connected,
  copiedId,
  addingId,
  zoteroByUrl,
  onJump,
  onCopy,
  onCopyUrl,
  onCopyWorksCited,
  onAddToZotero,
  onRefresh,
}: {
  rows: UsedEssaySource[];
  style: CiteStyleId;
  connected: boolean;
  copiedId: string | null;
  addingId: string | null;
  zoteroByUrl: Record<string, ZoteroSearchHit>;
  onJump: (pos: number) => void;
  onCopy: (id: string, text: string) => void;
  onCopyUrl: (id: string, url: string) => void;
  onCopyWorksCited: () => void;
  onAddToZotero?: (row: UsedEssaySource) => void;
  onRefresh?: (row: UsedEssaySource) => void | Promise<void>;
}) {
  return (
    <section className="cite-essay">
      <div className="cite-essay-head">
        <h3>Cited here</h3>
        {rows.length > 0 && (
          <button type="button" className="cite-action" onClick={onCopyWorksCited}>
            {copiedId === "works-cited" ? "Copied" : "Copy list"}
          </button>
        )}
      </div>
      <p className="cite-empty">
        Footnotes still in this essay, or a citation pasted at the caret.
        Deleted notes drop off. Copy list for a bibliography.
      </p>
      {rows.length > 0 && (
        <ul className="cite-essay-list">
          {rows.map((row) => {
            const text = displayFormatted(row.citation, style);
            const url = row.citation.url;
            const urlKey = url
              ? canonicalizeLibraryUrl(url) ?? url.trim()
              : "";
            const zoteroHit =
              row.citation.provider === "zotero"
                ? undefined
                : urlKey
                  ? zoteroByUrl[urlKey]
                  : undefined;
            const addId = `used:${row.citation.id}`;
            return (
              <li key={row.citation.id} className="cite-essay-row">
                <button
                  type="button"
                  className="cite-essay-item"
                  onClick={() => {
                    if (row.footnote) onJump(row.footnote.pos);
                  }}
                  title={text}
                  disabled={!row.footnote}
                >
                  <span className="cite-essay-title">{row.citation.title}</span>
                  {row.edited && <span className="cite-edited">edited</span>}
                </button>
                <button
                  type="button"
                  className="cite-action"
                  onClick={() => onCopy(addId, text)}
                >
                  {copiedId === addId ? "Copied" : "Copy"}
                </button>
                {url && (
                  <button
                    type="button"
                    className="cite-action"
                    onClick={() => onCopyUrl(`${addId}:url`, url)}
                  >
                    {copiedId === `${addId}:url` ? "Copied URL" : "Copy URL"}
                  </button>
                )}
                {row.citation.bibtex && (
                  <button
                    type="button"
                    className="cite-action"
                    onClick={() =>
                      onCopy(`used-bib:${row.citation.id}`, row.citation.bibtex ?? "")
                    }
                  >
                    BibTeX
                  </button>
                )}
                {onAddToZotero && url && row.citation.provider !== "zotero" && !zoteroHit && (
                  <button
                    type="button"
                    className="cite-action"
                    disabled={addingId === addId}
                    onClick={() => onAddToZotero(row)}
                  >
                    {addingId === addId ? "Adding…" : "Add to Zotero"}
                  </button>
                )}
                {zoteroHit && connected && (
                  <a className="cite-zotero-link" href={zoteroSelectHref(zoteroHit)}>
                    Open in Zotero
                  </a>
                )}
                {onRefresh && row.citation.provider === "zotero" && connected && (
                  <button
                    type="button"
                    className="cite-action"
                    onClick={() => void onRefresh(row)}
                  >
                    Refresh
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EssayLinksList({
  rows,
  open,
  onToggle,
  connected,
  copiedId,
  addingId,
  zoteroByUrl,
  onJump,
  onCopyUrl,
  onAddToLibrary,
  onAddToZotero,
  inLibrary,
}: {
  rows: EssayLinkedUrl[];
  open: boolean;
  onToggle: () => void;
  connected: boolean;
  copiedId: string | null;
  addingId: string | null;
  zoteroByUrl: Record<string, ZoteroSearchHit>;
  onJump: (pos: number) => void;
  onCopyUrl: (id: string, url: string) => void;
  onAddToLibrary: (row: EssayLinkedUrl) => void;
  onAddToZotero?: (row: EssayLinkedUrl) => void;
  inLibrary: (url: string) => boolean;
}) {
  const hosts = new Set(rows.map((row) => row.host)).size;
  return (
    <section className="cite-essay">
      <div className="cite-essay-head">
        <button
          type="button"
          className="cite-paste-toggle"
          aria-expanded={open}
          onClick={onToggle}
        >
          Links in this essay
          {rows.length > 0 && (
            <span className="cite-count">
              {rows.length}
              {hosts > 1 ? ` · ${hosts} sites` : ""}
            </span>
          )}
        </button>
      </div>
      {open && (
        <>
          <p className="cite-empty">
            Every hyperlink in the essay and footnotes, with a count if you
            used it more than once. Add a BlogIDE-only URL to your Library or
            Zotero.
          </p>
          {rows.length === 0 ? (
            <p className="cite-empty">No http(s) links in this essay yet.</p>
          ) : (
            <ul className="cite-essay-list">
              {rows.map((row) => {
                const copyId = `link:${row.canonical}`;
                const zoteroHit = zoteroByUrl[row.canonical];
                const saved = inLibrary(row.url);
                return (
                  <li key={row.canonical} className="cite-essay-row">
                    <button
                      type="button"
                      className="cite-essay-item"
                      onClick={() => onJump(row.firstPos)}
                      title={row.url}
                    >
                      <span className="cite-hit-kind">{row.host}</span>
                      <span className="cite-essay-title">{row.title}</span>
                      {row.count > 1 && (
                        <span className="cite-count">×{row.count}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="cite-action"
                      onClick={() => onCopyUrl(`${copyId}:url`, row.url)}
                    >
                      {copiedId === `${copyId}:url` ? "Copied URL" : "Copy URL"}
                    </button>
                    {!saved && (
                      <button
                        type="button"
                        className="cite-action"
                        onClick={() => onAddToLibrary(row)}
                      >
                        Add to Library
                      </button>
                    )}
                    {onAddToZotero && !zoteroHit && (
                      <button
                        type="button"
                        className="cite-action"
                        disabled={addingId === copyId}
                        onClick={() => onAddToZotero(row)}
                      >
                        {addingId === copyId ? "Adding…" : "Add to Zotero"}
                      </button>
                    )}
                    {zoteroHit && connected && (
                      <a
                        className="cite-zotero-link"
                        href={zoteroSelectHref(zoteroHit)}
                      >
                        Open in Zotero
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
