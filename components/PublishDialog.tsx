"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  runPrePublishCheck,
  type PrePublishReport,
} from "@/lib/preview/runPrePublishCheck";
import {
  DEFAULT_MARKERS_OPTIONS,
  htmlForPublishTarget,
  PUBLISH_COPY_TARGETS,
  type MarkersCopyOptions,
  type PublishCopyTarget,
} from "@/lib/export/clipboardHtml";
import {
  analyzePublishInventory,
  emptyPublishInventory,
  inventorySummary,
  type PublishInventory,
} from "@/lib/export/publishChecklist";
import { copyDocumentForPaste, copyMarkdownToClipboard } from "@/lib/export/document";
import { showCopiedToast, showErrorToast } from "@/lib/ui/toast";
import { VAULT_SERVER_FEATURE_REASON } from "@/lib/vault/copy";
import {
  SUBSTACK_FOOTNOTE_HELPER,
  substackFootnoteBookmarklet,
} from "@/lib/export/substackEditorHelper";
import { substackIntroFromMarkdown } from "@/lib/markdown/substackIntro";
import { SendIcon } from "@/components/icons";
import {
  absolutizeSiteRelativeMarkdown,
  countSiteRelativeUrls,
} from "@/lib/siteRelative";
import {
  ActionButton,
  CopyIconButton,
  MiniButton,
  ToolPanel,
  type ToolPanelTab,
} from "@/components/ToolPanel";

export type PublishTab = "substack" | "other" | "links";

const TABS: ToolPanelTab<PublishTab>[] = [
  { id: "substack", label: "Substack" },
  { id: "other", label: "Other editors" },
  { id: "links", label: "Check links" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab?: PublishTab;
  /** Full document markdown (read fresh for every copy). */
  getMarkdown: () => string;
  /** The essay as of opening the panel, for the Substack checklist. */
  snapshot: string;
  title: string;
  subtitle: string;
  /** When false, skip link/image fetch (vault essays). */
  allowServerChecks?: boolean;
  /** Save the Substack-only intro to frontmatter. Unset: read-only. */
  onSubstackIntroChange?: (intro: string) => void;
  /** Writer's main site (Settings → Integrations); "" when unset. */
  siteUrl?: string;
};

/** "Prepare publish": copy the essay out to Substack or another editor. */
export function PublishDialog({ open, initialTab = "substack", ...rest }: Props) {
  if (!open) return null;
  return <PublishPanel key={initialTab} initialTab={initialTab} {...rest} />;
}

function PublishPanel({
  onClose,
  initialTab,
  getMarkdown,
  snapshot,
  title,
  subtitle,
  allowServerChecks = true,
  onSubstackIntroChange,
  siteUrl = "",
}: Omit<Props, "open"> & { initialTab: PublishTab }) {
  const [tab, setTab] = useState<PublishTab>(initialTab);
  const [linkRunId, setLinkRunId] = useState(0);
  const [linksVisited, setLinksVisited] = useState(initialTab === "links");
  const relative = useMemo(() => countSiteRelativeUrls(snapshot), [snapshot]);
  const relativeTotal = relative.images + relative.links;
  // Publishing anywhere but the main site: point /writing/… at that site.
  const [pointAtSite, setPointAtSite] = useState(true);
  const absolutize = Boolean(siteUrl) && relativeTotal > 0 && pointAtSite;
  const outboundGetMarkdown = useCallback(
    () =>
      absolutize
        ? absolutizeSiteRelativeMarkdown(getMarkdown(), siteUrl)
        : getMarkdown(),
    [absolutize, getMarkdown, siteUrl]
  );
  const outboundSnapshot = useMemo(
    () =>
      absolutize ? absolutizeSiteRelativeMarkdown(snapshot, siteUrl) : snapshot,
    [absolutize, snapshot, siteUrl]
  );
  const siteHost = siteUrl.replace(/^https?:\/\//, "");
  const relativeLabel = [
    relative.images ? `${relative.images} image${relative.images === 1 ? "" : "s"}` : "",
    relative.links ? `${relative.links} link${relative.links === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <ToolPanel
      title="Publish"
      icon={<SendIcon className="blogide-tool-icon" />}
      tabs={TABS}
      tab={tab}
      onTab={(next) => {
        setTab(next);
        if (next === "links") setLinksVisited(true);
      }}
      onClose={onClose}
    >
      {siteUrl && relativeTotal > 0 && (
        <ul className="blogide-publish-checklist">
          <CheckRow
            checked={pointAtSite}
            onChange={setPointAtSite}
            label={`Point site-relative ${relativeLabel} at ${siteHost}`}
            detail={
              pointAtSite
                ? `Copies use full ${siteHost} URLs, so they load anywhere. Turn off only when publishing on ${siteHost} itself.`
                : "Copies keep paths like /writing/…, which only load on your own site."
            }
          />
        </ul>
      )}
      {tab === "substack" && (
        <SubstackTab
          getMarkdown={outboundGetMarkdown}
          snapshot={outboundSnapshot}
          title={title}
          subtitle={subtitle}
          onIntroChange={onSubstackIntroChange}
        />
      )}
      {tab === "other" && <OtherEditorsTab getMarkdown={outboundGetMarkdown} />}
      {/* Keep the link report mounted so switching tabs doesn't re-fetch. */}
      {linksVisited && (
        <div hidden={tab !== "links"}>
          <LinksTab
            key={`${linkRunId}-${absolutize}`}
            getMarkdown={outboundGetMarkdown}
            onRerun={() => setLinkRunId((id) => id + 1)}
            allowServerChecks={allowServerChecks}
          />
        </div>
      )}
    </ToolPanel>
  );
}

async function copyFormatted(
  getMarkdown: () => string,
  target: PublishCopyTarget,
  options: MarkersCopyOptions
) {
  const spec = PUBLISH_COPY_TARGETS.find((item) => item.id === target);
  try {
    const markdown = getMarkdown();
    const { html, plain } = htmlForPublishTarget(markdown, target, options);
    await copyDocumentForPaste({ html, plain });
    const summary =
      target === "markers"
        ? inventorySummary(analyzePublishInventory(markdown), options)
        : "";
    showCopiedToast(
      target === "markers"
        ? `Copied text with markers${summary ? ` (${summary})` : ""}. Paste into Substack.`
        : `Copied ${spec?.label ?? "HTML"}. Paste into the other editor.`
    );
  } catch (err) {
    showErrorToast(
      err,
      "Copy failed. Try the essay menu → Export → HTML.",
      "clipboard-copy"
    );
  }
}

async function copyPlain(text: string, what: string) {
  try {
    await copyMarkdownToClipboard(text);
    showCopiedToast(`Copied ${what}.`);
  } catch (err) {
    showErrorToast(err, `Could not copy the ${what}.`, "clipboard-copy");
  }
}

function SubstackTab({
  getMarkdown,
  snapshot,
  title,
  subtitle,
  onIntroChange,
}: {
  getMarkdown: () => string;
  snapshot: string;
  title: string;
  subtitle: string;
  onIntroChange?: (intro: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [options, setOptions] = useState<MarkersCopyOptions>(
    DEFAULT_MARKERS_OPTIONS
  );
  const [intro, setIntro] = useState(() => substackIntroFromMarkdown(snapshot));
  const [savedIntro, setSavedIntro] = useState(intro);

  function saveIntro() {
    if (!onIntroChange || intro.trim() === savedIntro.trim()) return;
    onIntroChange(intro.trim());
    setSavedIntro(intro.trim());
  }
  const inventory = useMemo<PublishInventory>(() => {
    try {
      return analyzePublishInventory(snapshot);
    } catch {
      return emptyPublishInventory();
    }
  }, [snapshot]);

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy((current) => (current === id ? null : current));
    }
  }

  async function copyHelper(kind: "script" | "bookmarklet") {
    try {
      await copyMarkdownToClipboard(
        kind === "bookmarklet"
          ? substackFootnoteBookmarklet()
          : SUBSTACK_FOOTNOTE_HELPER
      );
      showCopiedToast(
        kind === "bookmarklet"
          ? "Bookmarklet copied. Create a bookmark and paste this as the URL."
          : "Helper copied. In the Substack editor, open the console (F12) and paste."
      );
    } catch (err) {
      showErrorToast(err, "Could not copy the helper.", "clipboard-copy");
    }
  }

  const needsHelper = helperNeeded(inventory, options);

  return (
    <section>
      <p className="blogide-cleanup-hint">
        Substack only makes clickable footnotes, LaTeX blocks, and poems
        through its own editor. Paste the text with markers, then run the
        helper in the Substack tab to finish the job.
      </p>

      <h3 className="blogide-cleanup-subhead">What this essay needs</h3>
      <SubstackChecklist
        inventory={inventory}
        options={options}
        onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
      />

      <h3 className="blogide-cleanup-subhead">Steps</h3>
      <ol className="blogide-publish-steps">
        <li>
          <div className="blogide-publish-step-row">
            <span>Title and subtitle</span>
            <MiniButton
              disabled={!title.trim()}
              title="Copy the title for Substack's title field"
              onClick={() => void copyPlain(title.trim(), "title")}
            >
              Title
            </MiniButton>
            <MiniButton
              disabled={!subtitle.trim()}
              title={
                subtitle.trim()
                  ? "Copy the subtitle for Substack's subtitle field"
                  : "No subtitle set (Essay settings → Title)"
              }
              onClick={() => void copyPlain(subtitle.trim(), "subtitle")}
            >
              Subtitle
            </MiniButton>
          </div>
          <p>Substack keeps these in their own fields, above the body.</p>
        </li>
        <li>
          <label className="blogide-publish-step-row" htmlFor="blogide-substack-intro">
            <span>Substack-only intro (optional)</span>
          </label>
          <textarea
            id="blogide-substack-intro"
            className="blogide-publish-intro"
            rows={2}
            value={intro}
            readOnly={!onIntroChange}
            placeholder="Crossposted from my site, which has hoverable footnotes."
            onChange={(event) => setIntro(event.target.value)}
            onBlur={saveIntro}
          />
          <p>
            Pasted above a divider, after the opening image if there is
            one. Markdown links and *italics* work. Saved as{" "}
            <code>substack_intro</code> in the frontmatter; nothing else
            uses it.
          </p>
        </li>
        <li>
          <div className="blogide-publish-step-row">
            <span>
              Copy text with markers
              {options.images && inventory.images.total ? " and images" : ""}
            </span>
            <CopyIconButton
              label={busy === "markers" ? "Copying…" : "Copy text with markers"}
              disabled={busy === "markers"}
              onClick={() =>
                void run("markers", () => {
                  saveIntro();
                  return copyFormatted(getMarkdown, "markers", {
                    ...options,
                    intro,
                  });
                })
              }
            />
          </div>
          <p>Paste into the body of your Substack draft.</p>
        </li>
        <li className={needsHelper ? "" : "is-optional"}>
          <div className="blogide-publish-step-row">
            <span>Run the helper{needsHelper ? "" : " (not needed)"}</span>
            <CopyIconButton
              label="Copy helper script"
              onClick={() => void copyHelper("script")}
            />
          </div>
          <p>
            In the Substack tab, open the console (F12), paste, and press
            Enter. It converts every marker it finds, checks images, and
            tells you what it did.
          </p>
          <div className="blogide-publish-step-alt">
            <span>Or save it as a bookmarklet</span>
            <CopyIconButton
              label="Copy bookmarklet"
              onClick={() => void copyHelper("bookmarklet")}
            />
          </div>
        </li>
      </ol>
      <p className="blogide-cleanup-hint">
        Skipping the helper? Uncheck footnotes above to paste static ¹
        numbers instead of [1] markers.
      </p>
    </section>
  );
}

function OtherEditorsTab({ getMarkdown }: { getMarkdown: () => string }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <section>
      <p className="blogide-cleanup-hint">
        Formatted HTML on the clipboard, with readable text as the fallback.
        Other editors can&apos;t receive native footnotes from a paste, so
        pick how the notes should look.
      </p>
      <div className="blogide-publish-targets">
        {PUBLISH_COPY_TARGETS.map((target) => (
          <ActionButton
            key={target.id}
            label={busy === target.id ? "Copying…" : target.label}
            hint={`${target.hint}${TARGET_FOR[target.id] ? ` · ${TARGET_FOR[target.id]}` : ""}`}
            disabled={busy === target.id}
            onClick={() => {
              setBusy(target.id);
              void copyFormatted(
                getMarkdown,
                target.id,
                DEFAULT_MARKERS_OPTIONS
              ).finally(() =>
                setBusy((current) => (current === target.id ? null : current))
              );
            }}
          />
        ))}
      </div>
      <p className="blogide-cleanup-hint is-spaced">
        Plain rich text (footnotes as editor marks), Markdown source, and
        files (HTML, PDF, Word) are in the essay menu under Copy and Export.
      </p>
    </section>
  );
}

const TARGET_FOR: Partial<Record<PublishCopyTarget, string>> = {
  markers: "any editor you'll fix by hand",
  superscripts: "Medium, Google Docs, email",
  html: "Ghost, WordPress, a personal site",
};

function LinksTab({
  getMarkdown,
  onRerun,
  allowServerChecks = true,
}: {
  getMarkdown: () => string;
  onRerun: () => void;
  allowServerChecks?: boolean;
}) {
  const [busy, setBusy] = useState(allowServerChecks);
  const [report, setReport] = useState<PrePublishReport | null>(null);
  const [error, setError] = useState<string | null>(() =>
    allowServerChecks ? null : VAULT_SERVER_FEATURE_REASON
  );
  const [onlyProblems, setOnlyProblems] = useState(false);

  useEffect(() => {
    if (!allowServerChecks) return;
    let cancelled = false;
    void runPrePublishCheck(getMarkdown())
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        setError(null);
        setBusy(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setReport(null);
        setError(
          err instanceof Error ? err.message : "Could not run the link check."
        );
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // Mount / remount (Re-check) only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = report
    ? onlyProblems
      ? report.rows.filter((row) => row.ok !== true)
      : report.rows
    : [];

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="blogide-cleanup-hint is-flush">
          Fetch every http(s) link and image in the essay and footnotes.
        </p>
        <MiniButton disabled={busy || !allowServerChecks} onClick={onRerun}>
          {busy ? "Checking…" : "Re-check"}
        </MiniButton>
      </div>
      {busy && !report && (
        <p className="text-xs text-muted">Checking links and images…</p>
      )}
      {!busy && error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {!busy && report && (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[0.65rem] text-muted">
              Checked {report.checked} URL{report.checked === 1 ? "" : "s"}
              {report.failed > 0
                ? ` · ${report.failed} failed`
                : report.warned === 0 && report.checked > 0
                  ? " · all ok"
                  : ""}
              {report.warned > 0 ? ` · ${report.warned} may be bot-blocked` : ""}
              {report.skipped > 0 ? ` · ${report.skipped} skipped` : ""}
            </p>
            {report.rows.some((row) => row.ok === true) && (
              <label className="blogide-inline-check">
                <input
                  type="checkbox"
                  checked={onlyProblems}
                  onChange={(event) => setOnlyProblems(event.target.checked)}
                />
                Problems only
              </label>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="text-xs text-muted">
              {report.rows.length === 0
                ? "No links or images found."
                : "Nothing to fix."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((row) => (
                <li
                  key={`${row.kind}:${row.url}`}
                  className="rounded border border-border px-2 py-1.5"
                >
                  <div className="flex items-start gap-2">
                    <StatusBadge ok={row.ok} soft={row.soft} />
                    <div className="min-w-0 flex-1">
                      <a
                        className="block truncate font-mono text-[0.65rem] hover:text-accent"
                        href={row.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={row.url}
                      >
                        {row.url}
                      </a>
                      <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-muted">
                        {row.kind}
                        {row.status != null ? ` · HTTP ${row.status}` : ""}
                      </div>
                      {(row.error || row.note) && (
                        <div className="mt-0.5 text-[0.65rem] text-muted">
                          {row.error || row.note}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function helperNeeded(
  inventory: PublishInventory,
  options: MarkersCopyOptions
): boolean {
  return (
    (options.footnotes && inventory.footnotes > 0) ||
    (options.superscripts && inventory.scripts > 0) ||
    (options.math && inventory.blockMath > 0) ||
    (options.poetry && inventory.poems > 0) ||
    (options.images && inventory.images.total > 0)
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Everything in the essay that will not survive a plain paste. A checked
 * box leaves a marker for the helper; unchecked pastes a static fallback.
 */
function SubstackChecklist({
  inventory,
  options,
  onChange,
}: {
  inventory: PublishInventory;
  options: MarkersCopyOptions;
  onChange: (patch: Partial<MarkersCopyOptions>) => void;
}) {
  const { images } = inventory;
  const imageWarnings: string[] = [];
  if (images.expiring) {
    imageWarnings.push(
      `${plural(images.expiring, "BlogIDE upload")} use links that expire in about a day. Substack usually re-hosts pasted images; the helper checks.`
    );
  }
  if (images.embedded) {
    imageWarnings.push(
      `${plural(images.embedded, "embedded image")} (vault/offline) may not paste. Upload by hand if missing.`
    );
  }
  if (images.relative) {
    imageWarnings.push(
      `${plural(images.relative, "image")} use a relative path and will not load in Substack.`
    );
  }
  if (images.captions) {
    imageWarnings.push(
      `${plural(images.captions, "caption")}: check they pasted under the image.`
    );
  }

  const rows: React.ReactNode[] = [];
  if (inventory.footnotes) {
    rows.push(
      <CheckRow
        key="footnotes"
        checked={options.footnotes}
        onChange={(footnotes) => onChange({ footnotes })}
        label={`${plural(inventory.footnotes, "footnote")} → native Substack footnotes`}
        detail={
          options.footnotes
            ? "Pastes [1] markers + a Notes list; the helper inserts real footnotes."
            : "Pastes static ¹ numbers + a Notes list. Not clickable."
        }
      />
    );
  }
  if (images.total) {
    rows.push(
      <CheckRow
        key="images"
        checked={options.images}
        onChange={(value) => onChange({ images: value })}
        label={`Copy ${plural(images.total, "image")}`}
        detail={
          options.images
            ? "Pasted with the text. The helper reports any still hosted outside Substack."
            : "Left out. Upload them in Substack yourself."
        }
        warnings={options.images ? imageWarnings : []}
      />
    );
  }
  if (inventory.scripts) {
    rows.push(
      <CheckRow
        key="scripts"
        checked={options.superscripts}
        onChange={(superscripts) => onChange({ superscripts })}
        label={`${plural(inventory.scripts, "superscript/subscript")} → restore formatting`}
        detail={
          options.superscripts
            ? "Pastes {sup:27} markers (Substack drops quotes that contain <sup>); the helper formats them."
            : "Pastes Unicode ²⁷ where possible, plain text otherwise."
        }
      />
    );
  }
  if (inventory.blockMath) {
    rows.push(
      <CheckRow
        key="math"
        checked={options.math}
        onChange={(math) => onChange({ math })}
        label={`${plural(inventory.blockMath, "display equation")} → Substack LaTeX blocks`}
        detail={
          options.math
            ? "Pastes $$…$$ paragraphs; the helper converts them if this Substack editor has a LaTeX block."
            : "Pastes the LaTeX source as a code block."
        }
      />
    );
  }
  if (inventory.inlineMath) {
    rows.push(
      <NoteRow
        key="inline-math"
        label={plural(inventory.inlineMath, "inline equation")}
        detail="Substack has no inline math. Pastes as $…$ source text; rewrite or use a LaTeX block."
        warn
      />
    );
  }
  if (inventory.poems) {
    rows.push(
      <CheckRow
        key="poetry"
        checked={options.poetry}
        onChange={(poetry) => onChange({ poetry })}
        label={`${plural(inventory.poems, "poem")} → Substack poetry`}
        detail={
          options.poetry
            ? "Pastes {poetry} … {/poetry} around each poem; the helper wraps it if this editor has a poem block. Poems in quotes keep line breaks only."
            : "Pastes line breaks and indents only."
        }
      />
    );
  }
  if (inventory.tables) {
    rows.push(
      <NoteRow
        key="tables"
        label={plural(inventory.tables, "table")}
        detail="Substack has no tables; the paste flattens them. Use an image or a list."
        warn
      />
    );
  }

  if (!rows.length) {
    return (
      <p className="blogide-cleanup-hint">
        Nothing risky found: headings, emphasis, links, lists, and quotes
        paste as-is. The helper is not needed.
      </p>
    );
  }
  return <ul className="blogide-publish-checklist">{rows}</ul>;
}

function CheckRow({
  checked,
  onChange,
  label,
  detail,
  warnings = [],
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  detail: string;
  warnings?: string[];
}) {
  return (
    <li>
      <label className="blogide-publish-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          {label}
          <span className="blogide-publish-check-detail">{detail}</span>
          {warnings.map((warning) => (
            <span
              key={warning}
              className="blogide-publish-check-detail text-amber-800 dark:text-amber-300"
            >
              ⚠ {warning}
            </span>
          ))}
        </span>
      </label>
    </li>
  );
}

function NoteRow({
  label,
  detail,
  warn,
}: {
  label: string;
  detail: string;
  warn?: boolean;
}) {
  return (
    <li>
      <div className="blogide-publish-check">
        <span className="blogide-publish-check-mark" aria-hidden>
          {warn ? "⚠" : "•"}
        </span>
        <span>
          {label}
          <span
            className={
              warn
                ? "blogide-publish-check-detail text-amber-800 dark:text-amber-300"
                : "blogide-publish-check-detail"
            }
          >
            {detail}
          </span>
        </span>
      </div>
    </li>
  );
}

function StatusBadge({ ok, soft }: { ok: boolean | null; soft?: boolean }) {
  if (ok === true) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-emerald-700 dark:text-emerald-400">
        OK
      </span>
    );
  }
  if (ok === false && soft) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-800 dark:text-amber-300">
        Warn
      </span>
    );
  }
  if (ok === false) {
    return (
      <span className="mt-0.5 shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:text-red-400">
        Fail
      </span>
    );
  }
  return (
    <span className="mt-0.5 shrink-0 rounded bg-panel px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted">
      Skip
    </span>
  );
}
