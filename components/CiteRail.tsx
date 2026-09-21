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
import { BookmarkCheckIcon, BookmarkIcon, PanelCaret, ZoteroMarkIcon } from "@/components/icons";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import {
  CITE_STYLE_LABELS,
  citeStyleFromDashPref,
  type CiteStyleId,
} from "@/lib/citations/citeStyle";
import { copyPlainText, citeCopyToastMessage } from "@/lib/citations/clipboard";
import {
  essayLinkedUrlsEqual,
  listEssayLinkedUrls,
  type EssayLinkedUrl,
} from "@/lib/citations/essayLinks";
import {
  citationsSnapshotEqual,
  displayFormatted,
  listUsedEssaySources,
  pruneEssayCitations,
  usedEssaySourcesEqual,
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
import { hitFromLibraryEntry, saveEnrichedLibraryLink } from "@/lib/citations/libraryCite";
import { pageCitationFromBibtex } from "@/lib/preview/pageCitation";
import {
  getEssayEditor,
  subscribeEssayEditor,
} from "@/lib/citations/essayEditor";
import { OPEN_LIBRARY_CITE_EVENT } from "@/lib/citations/openLibraryCite";
import { canonicalizeLibraryUrl } from "@/lib/library/urls";
import {
  addLibraryBibtexEntriesDurable,
  findLibraryLinkByUrl,
  getLibraryServerSnapshot,
  listLibraryEntries,
  removeLibraryEntryDurable,
  resolveLibraryPdfSrc,
  subscribeLibrary,
  type LibraryMeta,
} from "@/lib/library/sessionLibrary";
import { resolveLibraryOpenTarget } from "@/lib/library/openLibraryItem";
import { openLinkPin, openPdfPin } from "@/lib/pins/pinStore";
import { showCopiedToast, showErrorToast, showSuccessToast, showToast } from "@/lib/ui/toast";
import { useSyncExternalStore } from "react";
import type { EssayCitation } from "@/lib/markdown/essayCitations";
import {
  EDITOR_WORK_MS,
  cancelEditorWork,
  scheduleEditorWork,
} from "@/lib/editor/workSchedule";

const SEARCH_DEBOUNCE_MS = EDITOR_WORK_MS.citeInventory;

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
  const [searching, setSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedUsedId, setExpandedUsedId] = useState<string | null>(null);
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(true);
  const [citedOpen, setCitedOpen] = useState(true);
  const [pasteSource, setPasteSource] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [used, setUsed] = useState<UsedEssaySource[]>([]);
  const [linkedUrls, setLinkedUrls] = useState<EssayLinkedUrl[]>([]);
  const [essayCitations, setEssayCitations] = useState<EssayCitation[]>([]);
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
    const workId = "cite-inventory";
    const refresh = (includeLinks: boolean) => {
      if (editor.isDestroyed) return;
      const current = readEssayCitations(editor);
      const next = pruneEssayCitations(current, editor.state.doc);
      if (!citationsSnapshotEqual(current, next)) {
        writeEssayCitations(editor, next);
      }
      const citations = citationsSnapshotEqual(current, next) ? current : next;
      setEssayCitations((prev) =>
        citationsSnapshotEqual(prev, citations) ? prev : citations
      );
      const nextUsed = listUsedEssaySources(
        citations,
        editor.state.doc,
        style
      );
      setUsed((prev) => (usedEssaySourcesEqual(prev, nextUsed) ? prev : nextUsed));
      if (includeLinks) {
        const nextLinks = listEssayLinkedUrls(editor.state.doc);
        setLinkedUrls((prev) =>
          essayLinkedUrlsEqual(prev, nextLinks) ? prev : nextLinks
        );
      }
    };
    refresh(linksOpen);
    const onUpdate = () => {
      scheduleEditorWork(workId, EDITOR_WORK_MS.citeInventory, () =>
        refresh(linksOpen)
      );
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      cancelEditorWork(workId);
    };
  }, [editor, style, linksOpen]);

  useEffect(() => {
    function focusSearch() {
      window.setTimeout(() => searchRef.current?.focus(), 40);
    }
    window.addEventListener(OPEN_LIBRARY_CITE_EVENT, focusSearch);
    return () => window.removeEventListener(OPEN_LIBRARY_CITE_EVENT, focusSearch);
  }, []);

  const essayHits = essayCitations.map((citation) =>
    hitFromEssayCitation(citation, style)
  );
  const libraryHits = libraryEntries.map((entry) =>
    hitFromLibraryEntry(entry, style)
  );

  function zoteroHitForUrl(url: string | undefined): ZoteroSearchHit | undefined {
    if (!url) return undefined;
    const key = canonicalizeLibraryUrl(url) ?? url.trim();
    return zoteroByUrl[key];
  }

  async function addToZotero(id: string, url: string, title?: string, bibtex?: string) {
    if (!connected) return;
    setAddingId(id);
    try {
      const stored = bibtex ? pageCitationFromBibtex(bibtex, url) : undefined;
      const result = await addUrlToZotero(
        config,
        { url, title, citation: stored },
        style
      );
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
      const existing = findLibraryLinkByUrl(url);
      if (existing) {
        await removeLibraryEntryDurable(existing.id);
        showSuccessToast("Removed from Library.", undefined, "cite-library-add");
        return;
      }
      await saveEnrichedLibraryLink({ url, title });
      showSuccessToast("Saved to Library.", undefined, "cite-library-add");
    } catch (err) {
      showErrorToast(err, "Could not update Library.", "cite-library-add");
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
    ? listSearchHits(remoteHits, essayHits, libraryHits, q)
    : listBrowseHits(libraryHits);

  function onStyleChange(next: CiteStyleId) {
    setStyle(next);
    saveZoteroConfig({ style: next });
  }

  async function importBibtex(source: string) {
    const hits = hitsFromBibtex(source, style);
    if (hits.length === 0) {
      showToast({
        tone: "error",
        message: "No BibTeX entries found. Paste an @article{…} or @book{…}.",
        replaceKey: "cite-bibtex",
      });
      return [];
    }
    try {
      const entries = await addLibraryBibtexEntriesDurable(
        hits.map((hit) => ({
          citeKey: hit.citeKey,
          title: hit.title,
          bibtex: hit.bibtex,
          url: hit.url,
        }))
      );
      const first = entries[0];
      setExpandedId(first ? `library:${first.id}` : null);
      setPasteSource("");
      showSuccessToast(
        entries.length === 1
          ? "Saved to Library."
          : `Saved ${entries.length} entries to Library.`,
        undefined,
        "cite-bibtex"
      );
      return entries;
    } catch (err) {
      showErrorToast(err, "Could not add that BibTeX.", "cite-bibtex");
      return [];
    }
  }

  function onPasteFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text().then((text) => {
      setPasteSource(text);
      void importBibtex(text);
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
      void importBibtex(text);
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
    if (ok) {
      flashCopied(id);
      showCopiedToast(citeCopyToastMessage(id));
    } else showErrorToast("Could not copy to the clipboard.", "Could not copy.", "cite-copy");
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
                  hit.url && hitKindLabel(hit) !== "pdf"
                    ? () => void copyText(`${hit.id}:url`, hit.url!)
                    : undefined
                }
                onCopyBibtex={() => void copyText(`${hit.id}:bib`, hit.bibtex)}
                onAddToZotero={
                  connected && hit.url && !zoteroHit
                    ? () => void addToZotero(hit.id, hit.url!, hit.title, hit.bibtex)
                    : undefined
                }
                onOpenZotero={
                  zoteroHit && connected
                    ? () => {
                        window.location.href = zoteroSelectHref(zoteroHit);
                      }
                    : undefined
                }
                onOpen={
                  hitKindLabel(hit) === "pdf" || hit.url
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

      <div className="cite-paste">
        <CiteSectionToggle
          open={pasteOpen}
          onToggle={() => setPasteOpen((value) => !value)}
          label="Paste BibTeX"
        />
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
                onClick={() => void importBibtex(pasteSource)}
              >
                Add to library
              </button>
              <label className="cite-action cite-file">
                Upload .bib
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

      {afterResults}

      <ThisEssayList
        rows={used}
        style={style}
        open={citedOpen}
        onToggle={() => setCitedOpen((value) => !value)}
        connected={connected}
        copiedId={copiedId}
        expandedId={expandedUsedId}
        onExpand={(id) =>
          setExpandedUsedId((current) => (current === id ? null : id))
        }
        onJump={(pos) => {
          if (editor) scrollFootnoteIntoView(editor, pos);
        }}
        onCopy={(id, text) => void copyText(id, text)}
        onCopyUrl={(id, url) => void copyText(id, url)}
        onCopyWorksCited={() =>
          void copyText("works-cited", worksCitedBlock(used, style))
        }
        onOpenUrl={(url, title) => openLinkPin({ url, title: title || url })}
        onAddToLibrary={(row) => {
          const url = row.citation.url;
          if (!url) return;
          void addToLibrary(url, row.citation.title);
        }}
        onAddToZotero={
          connected
            ? (row) => {
                const url = row.citation.url;
                if (!url) return;
                void addToZotero(
                  `used:${row.citation.id}`,
                  url,
                  row.citation.title,
                  row.citation.bibtex
                );
              }
            : undefined
        }
        addingId={addingId}
        zoteroByUrl={zoteroByUrl}
        inLibrary={(url) => findLibraryLinkByUrl(url) != null}
        onRefresh={
          connected
            ? async (row) => {
                if (row.citation.provider !== "zotero") return;
                try {
                  const fresh = await getZoteroItem(config, row.citation.id, style);
                  if (!fresh?.footnote && !fresh?.citation) {
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
                        fresh.footnote || fresh.citation
                      );
                    }
                    showSuccessToast(
                      "Updated citation from Zotero.",
                      undefined,
                      "cite-zotero-refresh"
                    );
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
        expandedId={expandedLinkId}
        onExpand={(id) =>
          setExpandedLinkId((current) => (current === id ? null : id))
        }
        zoteroByUrl={zoteroByUrl}
        onJump={(pos) => {
          if (editor) scrollFootnoteIntoView(editor, pos);
        }}
        onCopyUrl={(id, url) => void copyText(id, url)}
        onOpenUrl={(url, title) => openLinkPin({ url, title: title || url })}
        onAddToLibrary={(row) => void addToLibrary(row.url, row.title)}
        onAddToZotero={
          connected
            ? (row) => void addToZotero(`link:${row.canonical}`, row.url, row.title)
            : undefined
        }
        inLibrary={(url) => findLibraryLinkByUrl(url) != null}
      />

    </div>
  );
}

async function openLibraryHit(
  entries: LibraryMeta[],
  hit: CiteHit
): Promise<void> {
  const target = await resolveLibraryOpenTarget(
    entries,
    hit,
    resolveLibraryPdfSrc
  );
  if (!target) return;
  if (target.kind === "pdf") {
    openPdfPin({
      src: target.src,
      title: target.title,
      revokeOnClose: false,
    });
    return;
  }
  openLinkPin({ url: target.url, title: target.title });
}

function CitationForms({ hit }: { hit: CiteHit }) {
  const bibliography =
    hit.bibliography && hit.bibliography !== hit.formatted ? hit.bibliography : "";
  const labeled = Boolean(hit.inText || bibliography);
  if (!labeled) {
    return (
      <p className="cite-preview-text">
        {hit.formatted ||
          "No formatted citation yet. Paste BibTeX or refresh from Zotero."}
      </p>
    );
  }
  return (
    <div className="cite-forms">
      {hit.formatted && (
        <div>
          <p className="cite-preview-label">Footnote</p>
          <p className="cite-preview-text">{hit.formatted}</p>
        </div>
      )}
      {hit.inText && (
        <div>
          <p className="cite-preview-label">In-text</p>
          <p className="cite-preview-text">{hit.inText}</p>
        </div>
      )}
      {bibliography && (
        <div>
          <p className="cite-preview-label">Bibliography</p>
          <p className="cite-preview-text">{bibliography}</p>
        </div>
      )}
    </div>
  );
}

function CiteHitRow({
  hit,
  expanded,
  copied,
  copiedUrl,
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
  onOpenZotero,
  onOpen,
  onRemove,
}: {
  hit: CiteHit;
  expanded: boolean;
  copied: boolean;
  copiedUrl: boolean;
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
  onOpenZotero?: () => void;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  const kind = hitKindLabel(hit);
  const detail = [hit.creators, hit.year].filter(Boolean).join(" · ");
  const zoteroSaved = Boolean(zoteroHit);
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
              <CitationForms hit={hit} />
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
              <button
                type="button"
                className={`cite-action${kind === "pdf" ? " is-primary" : ""}`}
                onClick={onOpen}
              >
                {kind === "pdf" ? "Open PDF" : "Open"}
              </button>
            )}
            {(onAddToZotero || onOpenZotero) && (
              <CiteSaveChip
                kind="zotero"
                saved={zoteroSaved}
                busy={addingToZotero}
                onClick={zoteroSaved ? onOpenZotero ?? onAddToZotero : onAddToZotero}
              />
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

function CiteSaveChip({
  kind,
  busy,
  saved,
  compact,
  onClick,
}: {
  kind: "library" | "zotero";
  busy?: boolean;
  saved?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const addLabel = kind === "library" ? "Add to Library" : "Add to Zotero";
  const savedLabel =
    kind === "library" ? "In Library" : "In Zotero";
  const title = busy ? "Adding…" : saved ? savedLabel : addLabel;
  const plusLabel = kind === "library" ? "+ Library" : "+ Zotero";
  return (
    <button
      type="button"
      className={`cite-action cite-save-chip${compact ? " is-compact" : ""}${
        saved ? " is-saved" : ""
      }`}
      disabled={busy || !onClick}
      title={title}
      aria-label={title}
      aria-pressed={saved}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
    >
      {compact ? (
        <span className="cite-save-mark" aria-hidden>
          {kind === "library" ? (
            <BookmarkIcon className="cite-save-icon" />
          ) : (
            <ZoteroMarkIcon className="cite-save-icon" />
          )}
          {saved && (
            <span className="cite-save-check">
              <BookmarkCheckIcon />
            </span>
          )}
        </span>
      ) : (
        <>
          <span>{busy ? "…" : saved ? (kind === "library" ? "Library" : "Zotero") : plusLabel}</span>
          {saved && (
            <span className="cite-save-check">
              <BookmarkCheckIcon />
            </span>
          )}
        </>
      )}
    </button>
  );
}

function CiteSectionToggle({
  open,
  onToggle,
  label,
  extra,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  extra?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`cite-section-toggle ${open ? "is-open" : ""}`}
      aria-expanded={open}
      onClick={onToggle}
    >
      <PanelCaret direction="right" className="cite-hit-caret" size={10} />
      <span className="cite-section-label">{label}</span>
      {extra}
    </button>
  );
}

function displayEssayLinkTitle(row: EssayLinkedUrl): string {
  const title = row.title.trim();
  if (!title) return row.host;
  if (/^https?:\/\//i.test(title)) return title.toLowerCase();
  if (title.toLowerCase() === row.host) return row.host;
  return title;
}

function ThisEssayList({
  rows,
  style,
  open,
  onToggle,
  connected,
  copiedId,
  addingId,
  expandedId,
  zoteroByUrl,
  onExpand,
  onJump,
  onCopy,
  onCopyUrl,
  onCopyWorksCited,
  onOpenUrl,
  onAddToLibrary,
  onAddToZotero,
  inLibrary,
  onRefresh,
}: {
  rows: UsedEssaySource[];
  style: CiteStyleId;
  open: boolean;
  onToggle: () => void;
  connected: boolean;
  copiedId: string | null;
  addingId: string | null;
  expandedId: string | null;
  zoteroByUrl: Record<string, ZoteroSearchHit>;
  onExpand: (id: string) => void;
  onJump: (pos: number) => void;
  onCopy: (id: string, text: string) => void;
  onCopyUrl: (id: string, url: string) => void;
  onCopyWorksCited: () => void;
  onOpenUrl: (url: string, title?: string) => void;
  onAddToLibrary: (row: UsedEssaySource) => void;
  onAddToZotero?: (row: UsedEssaySource) => void;
  inLibrary: (url: string) => boolean;
  onRefresh?: (row: UsedEssaySource) => void | Promise<void>;
}) {
  return (
    <section className="cite-essay">
      <div className="cite-essay-head">
        <CiteSectionToggle
          open={open}
          onToggle={onToggle}
          label="Cited here"
          extra={
            rows.length > 0 ? (
              <span className="cite-count">{rows.length}</span>
            ) : undefined
          }
        />
        {open && rows.length > 0 && (
          <button type="button" className="cite-action" onClick={onCopyWorksCited}>
            {copiedId === "works-cited" ? "Copied" : "Copy list"}
          </button>
        )}
      </div>
      {open && (
        <p className="cite-empty">
          Footnotes still in this essay, or a citation pasted at the caret.
          Deleted notes drop off. Copy list for a bibliography.
        </p>
      )}
      {open && rows.length > 0 && (
        <ul className="cite-hit-list">
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
            const expanded = expandedId === addId;
            const saved = url ? inLibrary(url) : false;
            const zoteroSaved =
              row.citation.provider === "zotero" || Boolean(zoteroHit);
            return (
              <li
                key={row.citation.id}
                className={`cite-hit ${expanded ? "is-expanded" : ""}`}
              >
                <button
                  type="button"
                  className="cite-hit-main"
                  onClick={() => onExpand(addId)}
                  aria-expanded={expanded}
                >
                  <PanelCaret
                    direction="right"
                    className="cite-hit-caret"
                    size={10}
                  />
                  <span className="cite-hit-title">{row.citation.title}</span>
                  {row.edited && <span className="cite-edited">edited</span>}
                </button>
                {expanded && (
                  <>
                    <div className="cite-hit-preview">
                      <p className="cite-preview-text">{text}</p>
                      {url && (
                        <p className="cite-hit-meta">{url.toLowerCase()}</p>
                      )}
                    </div>
                    <div className="cite-hit-actions">
                      {row.footnote && (
                        <button
                          type="button"
                          className="cite-action"
                          onClick={() => onJump(row.footnote!.pos)}
                        >
                          Show
                        </button>
                      )}
                      <button
                        type="button"
                        className="cite-action"
                        onClick={() => onCopy(addId, text)}
                      >
                        {copiedId === addId ? "Copied" : "Copy"}
                      </button>
                      {url && (
                        <>
                          <button
                            type="button"
                            className="cite-action"
                            onClick={() => onCopyUrl(`${addId}:url`, url)}
                          >
                            {copiedId === `${addId}:url` ? "Copied URL" : "Copy URL"}
                          </button>
                          <button
                            type="button"
                            className="cite-action"
                            onClick={() => onOpenUrl(url, row.citation.title)}
                          >
                            Open
                          </button>
                          <CiteSaveChip
                            kind="library"
                            saved={saved}
                            onClick={() => onAddToLibrary(row)}
                          />
                        </>
                      )}
                      {row.citation.bibtex && (
                        <button
                          type="button"
                          className="cite-action"
                          onClick={() =>
                            onCopy(
                              `used-bib:${row.citation.id}`,
                              row.citation.bibtex ?? ""
                            )
                          }
                        >
                          BibTeX
                        </button>
                      )}
                      {connected && (url || zoteroSaved) && (
                        <CiteSaveChip
                          kind="zotero"
                          saved={zoteroSaved}
                          busy={addingId === addId}
                          onClick={
                            zoteroHit
                              ? () => {
                                  window.location.href = zoteroSelectHref(zoteroHit);
                                }
                              : onAddToZotero && url && row.citation.provider !== "zotero"
                                ? () => onAddToZotero(row)
                                : undefined
                          }
                        />
                      )}
                      {onRefresh &&
                        row.citation.provider === "zotero" &&
                        connected && (
                          <button
                            type="button"
                            className="cite-action"
                            onClick={() => void onRefresh(row)}
                          >
                            Refresh
                          </button>
                        )}
                    </div>
                  </>
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
  expandedId,
  zoteroByUrl,
  onExpand,
  onJump,
  onCopyUrl,
  onOpenUrl,
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
  expandedId: string | null;
  zoteroByUrl: Record<string, ZoteroSearchHit>;
  onExpand: (id: string) => void;
  onJump: (pos: number) => void;
  onCopyUrl: (id: string, url: string) => void;
  onOpenUrl: (url: string, title?: string) => void;
  onAddToLibrary: (row: EssayLinkedUrl) => void;
  onAddToZotero?: (row: EssayLinkedUrl) => void;
  inLibrary: (url: string) => boolean;
}) {
  const hosts = new Set(rows.map((row) => row.host)).size;
  return (
    <section className="cite-essay">
      <div className="cite-essay-head">
        <CiteSectionToggle
          open={open}
          onToggle={onToggle}
          label="Links in this essay"
          extra={
            rows.length > 0 ? (
              <span className="cite-count">
                {rows.length}
                {hosts > 1 ? ` · ${hosts} sites` : ""}
              </span>
            ) : undefined
          }
        />
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
            <ul className="cite-hit-list">
              {rows.map((row) => {
                const copyId = `link:${row.canonical}`;
                const zoteroHit = zoteroByUrl[row.canonical];
                const saved = inLibrary(row.url);
                const expanded = expandedId === copyId;
                return (
                  <li
                    key={row.canonical}
                    className={`cite-hit ${expanded ? "is-expanded" : ""}`}
                  >
                    <div className="cite-hit-head">
                      <button
                        type="button"
                        className="cite-hit-main"
                        onClick={() => onExpand(copyId)}
                        aria-expanded={expanded}
                        title={row.url.toLowerCase()}
                      >
                        <PanelCaret
                          direction="right"
                          className="cite-hit-caret"
                          size={10}
                        />
                        <span className="cite-link-host">{row.host}</span>
                        <span className="cite-hit-title">
                          {displayEssayLinkTitle(row)}
                        </span>
                        {row.count > 1 && (
                          <span className="cite-count">×{row.count}</span>
                        )}
                      </button>
                      <div className="cite-hit-save">
                        <CiteSaveChip
                          kind="library"
                          compact
                          saved={saved}
                          onClick={() => onAddToLibrary(row)}
                        />
                        {connected && (
                          <CiteSaveChip
                            kind="zotero"
                            compact
                            saved={Boolean(zoteroHit)}
                            busy={addingId === copyId}
                            onClick={
                              zoteroHit
                                ? () => {
                                    window.location.href =
                                      zoteroSelectHref(zoteroHit);
                                  }
                                : onAddToZotero
                                  ? () => onAddToZotero(row)
                                  : undefined
                            }
                          />
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <>
                        <div className="cite-hit-preview">
                          <p className="cite-preview-text cite-link-url">
                            {row.url.toLowerCase()}
                          </p>
                        </div>
                        <div className="cite-hit-actions">
                          <button
                            type="button"
                            className="cite-action is-primary"
                            onClick={() => onOpenUrl(row.url, row.title)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="cite-action"
                            onClick={() => onJump(row.firstPos)}
                          >
                            Show
                          </button>
                          <button
                            type="button"
                            className="cite-action"
                            onClick={() => onCopyUrl(`${copyId}:url`, row.url)}
                          >
                            {copiedId === `${copyId}:url` ? "Copied URL" : "Copy URL"}
                          </button>
                        </div>
                      </>
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
