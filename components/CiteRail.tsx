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
  displayFormatted,
  listUsedEssaySources,
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
  getZoteroItem,
  searchZoteroItems,
  zoteroErrorCopy,
  zoteroSelectHref,
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
import {
  getLibraryServerSnapshot,
  listLibraryEntries,
  removeLibraryEntryDurable,
  resolveLibraryPdfSrc,
  subscribeLibrary,
  type LibraryMeta,
} from "@/lib/library/sessionLibrary";
import { openLinkPin, openPdfPin } from "@/lib/pins/pinStore";
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
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(true);
  const [pasteSource, setPasteSource] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [citationsTick, setCitationsTick] = useState(0);
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
  const essayHits = essayCitations.map((citation) =>
    hitFromEssayCitation(citation, style)
  );
  const libraryHits = libraryEntries.map(hitFromLibraryEntry);

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
          setError(null);
        })
        .catch((err) => {
          if (gen !== searchGen.current) return;
          setZoteroHits([]);
          setError(zoteroErrorCopy(err));
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
      setError("No BibTeX entries found. Paste an @article{…} or @book{…}.");
      return [];
    }
    setError(null);
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
    else setError("Could not copy to the clipboard.");
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
            {results.map((hit) => (
              <CiteHitRow
                key={hit.id}
                hit={hit}
                expanded={expandedId === hit.id}
                copied={copiedId === hit.id}
                connected={connected}
                canCite={Boolean(editor) && hitCanCite(hit)}
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
                onCopyBibtex={() => void copyText(`${hit.id}:bib`, hit.bibtex)}
                onOpen={
                  hit.libraryId
                    ? () => void openLibraryHit(libraryEntries, hit)
                    : undefined
                }
                onRemove={
                  hit.libraryId
                    ? () => void removeLibraryEntryDurable(hit.libraryId!)
                    : undefined
                }
              />
            ))}
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
        onCopyWorksCited={() =>
          void copyText("works-cited", worksCitedBlock(used, style))
        }
        onRefresh={
          connected
            ? async (row) => {
                if (row.citation.provider !== "zotero") return;
                try {
                  const fresh = await getZoteroItem(config, row.citation.id, style);
                  if (!fresh?.citation) {
                    setError("Zotero had no formatted citation for that item.");
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
                  setError(null);
                } catch (err) {
                  setError(zoteroErrorCopy(err));
                }
              }
            : undefined
        }
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

      {error && <p className="cite-error">{error}</p>}
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
  if (hit.url && hitKindLabel(hit) === "link") {
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
  connected,
  canCite,
  onToggle,
  onInsertFootnote,
  onInsertCaret,
  onCopy,
  onCopyBibtex,
  onOpen,
  onRemove,
}: {
  hit: CiteHit;
  expanded: boolean;
  copied: boolean;
  connected: boolean;
  canCite: boolean;
  onToggle: () => void;
  onInsertFootnote: () => void;
  onInsertCaret: () => void;
  onCopy: () => void;
  onCopyBibtex: () => void;
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
            {hit.zotero && connected && (
              <a className="cite-zotero-link" href={zoteroSelectHref(hit.zotero)}>
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
  onJump,
  onCopy,
  onCopyWorksCited,
  onRefresh,
}: {
  rows: UsedEssaySource[];
  style: CiteStyleId;
  connected: boolean;
  copiedId: string | null;
  onJump: (pos: number) => void;
  onCopy: (id: string, text: string) => void;
  onCopyWorksCited: () => void;
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
        Footnotes already in this essay. Copy list for a bibliography. The
        Zotero key is read-only, so BlogIDE cannot add missing items back
        to Zotero.
      </p>
      {rows.length > 0 && (
        <ul className="cite-essay-list">
          {rows.map((row) => {
            const text = displayFormatted(row.citation, style);
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
                  onClick={() => onCopy(`used:${row.citation.id}`, text)}
                >
                  {copiedId === `used:${row.citation.id}` ? "Copied" : "Copy"}
                </button>
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
