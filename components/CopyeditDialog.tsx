"use client";

import { useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { applyCleanWhitespace } from "@/lib/editor/applyCleanWhitespace";
import {
  applyMatches,
  collectBlockTexts,
  copyeditScope,
  DASH_FORMS,
  DASH_TARGETS,
  dashInventory,
  dashTargetForm,
  dashTargetFromStyle,
  findDashes,
  revealMatch,
  runFormattingCheck,
  type CopyeditIssue,
  type CopyeditIssueId,
  type DashForm,
  type DashTarget,
} from "@/lib/editor/copyedit";
import {
  buildCopyeditRequest,
  COPYEDIT_KINDS,
  isPlainTextPatch,
  locatePlainText,
  parseCopyeditReply,
  type CopyeditKind,
  type CopyeditSuggestion,
} from "@/lib/ai/copyedit";
import { findPatchRange } from "@/lib/ai/apply";
import { chatCompletion } from "@/lib/ai/client";
import { getActiveProvider, loadAiKeys } from "@/lib/ai/keys";
import { wordDiff } from "@/lib/markdown/wordDiff";
import { WordDiffText } from "@/components/WordDiffText";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { CopyeditIcon } from "@/components/icons";
import {
  ActionButton,
  MiniButton,
  ToolPanel,
  type ToolPanelTab,
} from "@/components/ToolPanel";
import { VAULT_SERVER_FEATURE_REASON } from "@/lib/vault/copy";
import { showErrorToast } from "@/lib/ui/toast";
import {
  cancelEditorWork,
  EDITOR_WORK_MS,
  scheduleEditorWork,
} from "@/lib/editor/workSchedule";
import type { EditorPrefs } from "@/lib/settings";

export type CopyeditTab = "check" | "dashes" | "ai" | "import";

const TABS: ToolPanelTab<CopyeditTab>[] = [
  { id: "check", label: "Check" },
  { id: "dashes", label: "Dashes" },
  { id: "ai", label: "AI copyedit" },
  { id: "import", label: "Import fixes" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** TipTap editor when in rich-text mode; null in source view. */
  editor: Editor | null;
  initialTab?: CopyeditTab;
  getMarkdown: () => string;
  /** Replace the whole essay (AI fixes that touch markdown syntax). */
  applyMarkdown: (markdown: string) => void;
  onFixFootnotes?: () => void | Promise<void>;
  /** AI cleanup for messy paste; undefined in the vault. */
  onAiCleanup?: () => void | Promise<void>;
  /** False for vault essays (AI is a server feature). */
  allowAi?: boolean;
};

/**
 * Copyedit: formatting check, dash conversion, AI proofreading, and fixes
 * for pasted imports. Everything that touches punctuation lives here.
 */
export function CopyeditDialog({ open, initialTab = "check", editor, ...rest }: Props) {
  if (!open) return null;
  return (
    <CopyeditPanel
      key={`${initialTab}-${editor ? "ed" : "src"}`}
      initialTab={initialTab}
      editor={editor}
      {...rest}
    />
  );
}

type DashStyle = NonNullable<EditorPrefs["dashStyle"]>;

const STYLE_FOR_TARGET: Record<DashTarget, DashStyle> = {
  "closed-em": "chicago",
  "spaced-en": "mla",
  "spaced-em": "ap",
};

function CopyeditPanel({
  onClose,
  editor,
  initialTab,
  getMarkdown,
  applyMarkdown,
  onFixFootnotes,
  onAiCleanup,
  allowAi = true,
}: Omit<Props, "open"> & { initialTab: CopyeditTab }) {
  const [tab, setTab] = useState<CopyeditTab>(initialTab);
  const [dashPreset, setDashPreset] = useState<DashForm[] | null>(null);
  const { prefs, updatePrefs } = useEditorPrefs();
  const dashTarget = dashTargetFromStyle(prefs.dashStyle);
  const setDashTarget = (target: DashTarget) =>
    updatePrefs({ dashStyle: STYLE_FOR_TARGET[target] });

  const richOnly = (
    <p className="blogide-cleanup-hint">
      Switch to the rich text editor to use this tab.
    </p>
  );

  return (
    <ToolPanel
      title="Copyedit"
      icon={<CopyeditIcon className="blogide-tool-icon" />}
      tabs={TABS}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
    >
      {tab === "check" &&
        (editor ? (
          <CheckTab
            editor={editor}
            dashTarget={dashTarget}
            onOpenDashes={() => setTab("dashes")}
          />
        ) : (
          richOnly
        ))}
      {tab === "dashes" &&
        (editor ? (
          <DashesTab
            key={dashPreset?.join(",") ?? "all"}
            editor={editor}
            target={dashTarget}
            onTarget={setDashTarget}
            preset={dashPreset}
          />
        ) : (
          richOnly
        ))}
      {tab === "ai" && (
        <AiTab
          editor={editor}
          getMarkdown={getMarkdown}
          applyMarkdown={applyMarkdown}
          dashTarget={dashTarget}
          allowAi={allowAi}
        />
      )}
      {tab === "import" && (
        <ImportTab
          editor={editor}
          onFixFootnotes={onFixFootnotes}
          onAiCleanup={allowAi ? onAiCleanup : undefined}
          onConvertUkDashes={() => {
            setDashPreset(["spaced-en", "spaced-hyphen", "double-hyphen"]);
            setTab("dashes");
          }}
        />
      )}
    </ToolPanel>
  );
}

/** Re-run `compute` on open and (debounced) after every edit. */
function useLiveDocValue<T>(
  editor: Editor,
  compute: () => T,
  deps: unknown[]
): T {
  const [value, setValue] = useState<T>(compute);
  useEffect(() => {
    const workId = `copyedit-${editor.view.dom.id || "essay"}`;
    const refresh = () => setValue(compute());
    refresh();
    const onUpdate = () =>
      scheduleEditorWork(workId, EDITOR_WORK_MS.outlineStats, refresh);
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      cancelEditorWork(workId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, ...deps]);
  return value;
}

/** Fixes that are safe to apply in bulk without reading each one. */
const BULK_SAFE = new Set<CopyeditIssueId>([
  "straight-quotes",
  "mixed-dashes",
  "double-spaces",
  "space-before-punct",
  "edge-spaces",
  "three-dots",
]);

function CheckTab({
  editor,
  dashTarget,
  onOpenDashes,
}: {
  editor: Editor;
  dashTarget: DashTarget;
  onOpenDashes: () => void;
}) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const issues = useLiveDocValue(
    editor,
    () => runFormattingCheck(editor.state.doc, { dashTarget }),
    [dashTarget]
  );
  const [cursor, setCursor] = useState<Partial<Record<CopyeditIssueId, number>>>({});
  const bulk = issues.filter((issue) => BULK_SAFE.has(issue.id));

  // The list refreshes on a debounce, so act on a fresh scan every time.
  function fresh(id: CopyeditIssueId): CopyeditIssue | undefined {
    return runFormattingCheck(editor.state.doc, { dashTarget }).find(
      (item) => item.id === id
    );
  }

  function find(issue: CopyeditIssue) {
    const current = fresh(issue.id);
    if (!current) return;
    const index = (cursor[issue.id] ?? -1) + 1;
    const next = index % current.matches.length;
    setCursor((state) => ({ ...state, [issue.id]: next }));
    revealMatch(editor, current.matches[next]);
  }

  function fix(id: CopyeditIssueId) {
    const current = fresh(id);
    if (current) applyMatches(editor, current.matches);
    setCursor((state) => ({ ...state, [id]: undefined }));
  }

  function fixAllSafe() {
    for (const issue of bulk) fix(issue.id);
  }

  return (
    <section>
      <div className="blogide-copyedit-summary">
        <p className="blogide-cleanup-hint is-flush">
          {issues.length === 0
            ? "No formatting issues in this essay."
            : `Formatting check for the whole essay. Find steps through each one; fixes are one undo step.`}
        </p>
        {bulk.length > 1 && (
          <MiniButton primary onClick={fixAllSafe} title={bulk.map((i) => i.label).join("\n")}>
            Fix all
          </MiniButton>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="blogide-copyedit-issues">
          {issues.map((issue) => {
            const at = cursor[issue.id];
            return (
              <li key={issue.id}>
                <div className="blogide-copyedit-issue-text">
                  <span className="blogide-copyedit-issue-label">{issue.label}</span>
                  <span className="blogide-copyedit-issue-detail">{issue.detail}</span>
                </div>
                <div className="blogide-copyedit-issue-actions">
                  <MiniButton onClick={() => find(issue)} title="Select the next one in the essay">
                    {at != null ? `Find ${(at % issue.matches.length) + 1}/${issue.matches.length}` : "Find"}
                  </MiniButton>
                  {issue.id === "mixed-dashes" && (
                    <MiniButton onClick={onOpenDashes} title="Pick which dashes to convert">
                      Options
                    </MiniButton>
                  )}
                  {issue.fixLabel && (
                    <MiniButton primary onClick={() => fix(issue.id)}>
                      {issue.fixLabel}
                    </MiniButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="blogide-cleanup-subhead is-spaced">While you write</h3>
      <label className="blogide-inline-check">
        <input
          type="checkbox"
          checked={prefs.spellcheckEnabled}
          onChange={(event) => updatePrefs({ spellcheckEnabled: event.target.checked })}
        />
        Spelling and grammar underlines (Harper, on-device)
      </label>
      <label className="blogide-inline-check">
        <input
          type="checkbox"
          checked={prefs.typography}
          onChange={(event) => updatePrefs({ typography: event.target.checked })}
        />
        Smart typography: curly quotes, -- to a dash, ... to …
      </label>
      <p className="blogide-cleanup-hint is-spaced">
        Issue types, dialects, and your dictionary are in Settings → Writing
        check.
      </p>
    </section>
  );
}

function DashesTab({
  editor,
  target,
  onTarget,
  preset,
}: {
  editor: Editor;
  target: DashTarget;
  onTarget: (target: DashTarget) => void;
  preset: DashForm[] | null;
}) {
  const scope = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const { from, to, empty } = ed.state.selection;
      return empty ? "essay" : `${from}:${to}`;
    },
  });
  const counts = useLiveDocValue(
    editor,
    () => {
      const range = copyeditScope(editor);
      return dashInventory(
        collectBlockTexts(editor.state.doc),
        range.selection ? range : undefined
      );
    },
    [scope]
  );
  const targetForm = dashTargetForm(target);
  const [picked, setPicked] = useState<Set<DashForm>>(
    () => new Set(preset ?? DASH_FORMS.map((form) => form.id))
  );
  const from = DASH_FORMS.filter(
    (form) => form.id !== targetForm && picked.has(form.id)
  );
  const total = from.reduce((sum, form) => sum + counts[form.id], 0);
  const [done, setDone] = useState<string | null>(null);

  function convert() {
    const range = copyeditScope(editor);
    const blocks = collectBlockTexts(editor.state.doc);
    const matches = from.flatMap((form) =>
      findDashes(blocks, form.id, target, range.selection ? range : undefined)
    );
    const applied = applyMatches(editor, matches);
    setDone(
      applied
        ? `Converted ${applied} dash${applied === 1 ? "" : "es"}. Ctrl+Z undoes it.`
        : "Nothing to convert."
    );
  }

  return (
    <section>
      <label className="settings-row">
        <span>House style</span>
        <select
          value={target}
          onChange={(event) => onTarget(event.target.value as DashTarget)}
        >
          {DASH_TARGETS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="blogide-cleanup-hint">
        Used by the Check tab, AI copyedit, and the default citation style.
        Hyphenated words (good-faith) and number ranges (12–14) are never
        touched.
      </p>

      <h3 className="blogide-cleanup-subhead">
        Convert to {DASH_TARGETS.find((t) => t.id === target)?.sample}
        <span className="blogide-copyedit-scope">
          {scope === "essay" ? "whole essay" : "selection"}
        </span>
      </h3>
      <ul className="blogide-publish-checklist">
        {DASH_FORMS.filter((form) => form.id !== targetForm).map((form) => (
          <li key={form.id}>
            <label className="blogide-publish-check">
              <input
                type="checkbox"
                checked={picked.has(form.id)}
                onChange={(event) => {
                  setDone(null);
                  setPicked((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(form.id);
                    else next.delete(form.id);
                    return next;
                  });
                }}
              />
              <span className="blogide-copyedit-dash-row">
                <span>{form.label}</span>
                <code>{form.sample}</code>
                <span className="blogide-copyedit-count">{counts[form.id]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="blogide-cleanup-actions">
        <ActionButton
          primary
          label={total ? `Convert ${total} dash${total === 1 ? "" : "es"}` : "Nothing to convert"}
          disabled={!total}
          onClick={convert}
        />
      </div>
      {done && <p className="blogide-cleanup-hint is-spaced">{done}</p>}
    </section>
  );
}

type SuggestionState = "open" | "applied" | "missing" | "skipped";

function AiTab({
  editor,
  getMarkdown,
  applyMarkdown,
  dashTarget,
  allowAi,
}: {
  editor: Editor | null;
  getMarkdown: () => string;
  applyMarkdown: (markdown: string) => void;
  dashTarget: DashTarget;
  allowAi: boolean;
}) {
  const [aiReady, setAiReady] = useState(() => Boolean(getActiveProvider(loadAiKeys())));
  const [busy, setBusy] = useState<CopyeditKind | null>(null);
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState<{
    kind: CopyeditKind;
    scope: "essay" | "selection";
    suggestions: CopyeditSuggestion[];
    note: string;
  } | null>(null);
  const [states, setStates] = useState<Record<number, SuggestionState>>({});

  useEffect(() => {
    const refresh = () => setAiReady(Boolean(getActiveProvider(loadAiKeys())));
    window.addEventListener("blogide-ai-keys", refresh);
    return () => window.removeEventListener("blogide-ai-keys", refresh);
  }, []);

  const hasSelection = useSelectionFlag(editor);

  async function run(kind: CopyeditKind) {
    const essay = getMarkdown();
    const selectionText =
      editor && !editor.state.selection.empty
        ? editor.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
            "\n\n"
          )
        : null;
    setBusy(kind);
    setResult(null);
    setStates({});
    try {
      const { system, user } = buildCopyeditRequest({
        kind,
        essayMarkdown: essay,
        selectionText,
        dashTarget,
        custom,
      });
      const reply = await chatCompletion({
        system,
        messages: [{ role: "user", content: user }],
      });
      const parsed = parseCopyeditReply(reply);
      setResult({ kind, scope: selectionText ? "selection" : "essay", ...parsed });
    } catch (error) {
      showErrorToast(error, "AI copyedit failed.", "ai-copyedit");
    } finally {
      setBusy(null);
    }
  }

  /** Rich-text first (keeps undo + marks); markdown fallback for syntax. */
  function apply(suggestion: CopyeditSuggestion): boolean {
    const replacement =
      suggestion.search !== suggestion.search.trim()
        ? suggestion.replace.trim()
        : suggestion.replace;
    if (editor && isPlainTextPatch(suggestion)) {
      const range = locatePlainText(editor.state.doc, suggestion.search);
      if (!range) return false;
      const { state } = editor;
      const marks = state.doc.nodeAt(range.from)?.marks ?? [];
      const tr = replacement
        ? state.tr.replaceWith(range.from, range.to, state.schema.text(replacement, marks))
        : state.tr.delete(range.from, range.to);
      editor.view.dispatch(tr);
      return true;
    }
    const markdown = getMarkdown();
    const range = findPatchRange(markdown, suggestion.search);
    if (!range) return false;
    applyMarkdown(markdown.slice(0, range.from) + replacement + markdown.slice(range.to));
    return true;
  }

  function applyOne(suggestion: CopyeditSuggestion) {
    const ok = apply(suggestion);
    setStates((current) => ({ ...current, [suggestion.index]: ok ? "applied" : "missing" }));
  }

  function applyAll() {
    if (!result) return;
    const next = { ...states };
    for (const suggestion of result.suggestions) {
      if ((next[suggestion.index] ?? "open") !== "open") continue;
      next[suggestion.index] = apply(suggestion) ? "applied" : "missing";
    }
    setStates(next);
  }

  function find(suggestion: CopyeditSuggestion) {
    if (!editor) return;
    const range = locatePlainText(editor.state.doc, suggestion.search);
    if (range) revealMatch(editor, range);
    else setStates((current) => ({ ...current, [suggestion.index]: "missing" }));
  }

  if (!allowAi) {
    return <p className="blogide-cleanup-hint">{VAULT_SERVER_FEATURE_REASON}</p>;
  }
  if (!aiReady) {
    return (
      <p className="blogide-cleanup-hint">
        Add an Anthropic or OpenAI key under Settings → Integrations to
        proofread with AI. The formatting check and dash tools work without
        one.
      </p>
    );
  }

  const open = result?.suggestions.filter(
    (s) => (states[s.index] ?? "open") === "open"
  ).length ?? 0;

  return (
    <section>
      <p className="blogide-cleanup-hint">
        Suggests small fixes you review one by one. Checks the{" "}
        {hasSelection ? "selected passage" : "whole essay"}; select text
        first to narrow it.
      </p>
      <div className="blogide-cleanup-actions">
        {COPYEDIT_KINDS.map((kind) => (
          <ActionButton
            key={kind.id}
            label={busy === kind.id ? "Checking…" : kind.label}
            hint={kind.hint}
            disabled={busy != null}
            onClick={() => void run(kind.id)}
          />
        ))}
      </div>
      <form
        className="blogide-copyedit-custom"
        onSubmit={(event) => {
          event.preventDefault();
          if (custom.trim()) void run("custom");
        }}
      >
        <input
          type="text"
          className="settings-text-input"
          value={custom}
          placeholder="Or check for… (British spelling, Oxford comma)"
          aria-label="Custom copyedit check"
          onChange={(event) => setCustom(event.target.value)}
        />
        <MiniButton
          disabled={busy != null || !custom.trim()}
          onClick={() => void run("custom")}
        >
          {busy === "custom" ? "Checking…" : "Check"}
        </MiniButton>
      </form>

      {result && (
        <div className="mt-3">
          <div className="blogide-copyedit-summary">
            <p className="blogide-cleanup-hint is-flush">
              {result.suggestions.length === 0
                ? result.note || "Nothing to fix."
                : `${result.suggestions.length} suggestion${result.suggestions.length === 1 ? "" : "s"} for the ${result.scope}.`}
            </p>
            {open > 1 && (
              <MiniButton primary onClick={applyAll}>
                Apply all {open}
              </MiniButton>
            )}
          </div>
          <ul className="blogide-copyedit-issues">
            {result.suggestions.map((suggestion) => {
              const state = states[suggestion.index] ?? "open";
              return (
                <li key={suggestion.index} className={`is-${state}`}>
                  <div className="blogide-copyedit-issue-text">
                    <span className="blogide-copyedit-issue-label">{suggestion.label}</span>
                    <DiffPreview search={suggestion.search} replace={suggestion.replace} />
                    {state === "missing" && (
                      <span className="blogide-copyedit-issue-detail">
                        Not found in the essay (already fixed or edited).
                      </span>
                    )}
                  </div>
                  <div className="blogide-copyedit-issue-actions">
                    {state === "open" ? (
                      <>
                        {editor && isPlainTextPatch(suggestion) && (
                          <MiniButton onClick={() => find(suggestion)}>Find</MiniButton>
                        )}
                        <MiniButton
                          onClick={() =>
                            setStates((current) => ({ ...current, [suggestion.index]: "skipped" }))
                          }
                        >
                          Skip
                        </MiniButton>
                        <MiniButton primary onClick={() => applyOne(suggestion)}>
                          Apply
                        </MiniButton>
                      </>
                    ) : (
                      <span className="blogide-copyedit-state">
                        {state === "applied" ? "Applied" : state === "skipped" ? "Skipped" : "Missing"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function DiffPreview({ search, replace }: { search: string; replace: string }) {
  const segments = useMemo(() => wordDiff(search, replace), [search, replace]);
  return (
    <span className="blogide-copyedit-diff">
      <WordDiffText segments={segments} />
    </span>
  );
}

function useSelectionFlag(editor: Editor | null): boolean {
  const [flag, setFlag] = useState(() => Boolean(editor && !editor.state.selection.empty));
  useEffect(() => {
    if (!editor) return;
    const update = () => setFlag(!editor.state.selection.empty);
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor]);
  return flag;
}

function ImportTab({
  editor,
  onFixFootnotes,
  onAiCleanup,
  onConvertUkDashes,
}: {
  editor: Editor | null;
  onFixFootnotes?: () => void | Promise<void>;
  onAiCleanup?: () => void | Promise<void>;
  onConvertUkDashes: () => void;
}) {
  const [aiReady, setAiReady] = useState(() => Boolean(getActiveProvider(loadAiKeys())));
  const [aiBusy, setAiBusy] = useState(false);
  const hasSelection = useSelectionFlag(editor);

  useEffect(() => {
    const refresh = () => setAiReady(Boolean(getActiveProvider(loadAiKeys())));
    window.addEventListener("blogide-ai-keys", refresh);
    return () => window.removeEventListener("blogide-ai-keys", refresh);
  }, []);

  return (
    <section>
      <p className="blogide-cleanup-hint">
        One-off repairs for text pasted from Substack, Google Docs, Word, or
        a PDF.
      </p>
      <ul className="blogide-copyedit-issues">
        <li>
          <div className="blogide-copyedit-issue-text">
            <span className="blogide-copyedit-issue-label">Footnotes came in as links</span>
            <span className="blogide-copyedit-issue-detail">
              Turns Substack / Docs footnote links and a trailing notes block
              into real footnotes.
            </span>
          </div>
          <div className="blogide-copyedit-issue-actions">
            <MiniButton
              primary
              disabled={!onFixFootnotes}
              onClick={() => void onFixFootnotes?.()}
            >
              Fix footnotes
            </MiniButton>
          </div>
        </li>
        <li>
          <div className="blogide-copyedit-issue-text">
            <span className="blogide-copyedit-issue-label">Lines break mid-sentence</span>
            <span className="blogide-copyedit-issue-detail">
              PDF or email wraps. Select the passage; soft breaks become
              spaces, blank lines stay.
            </span>
          </div>
          <div className="blogide-copyedit-issue-actions">
            <MiniButton
              primary
              disabled={!editor || !hasSelection}
              title={editor && !hasSelection ? "Select the passage first" : undefined}
              onClick={() => editor && applyCleanWhitespace(editor)}
            >
              Join lines
            </MiniButton>
          </div>
        </li>
        <li>
          <div className="blogide-copyedit-issue-text">
            <span className="blogide-copyedit-issue-label">British or MLA dashes</span>
            <span className="blogide-copyedit-issue-detail">
              Convert spaced – (and - or --) to your house dash style.
            </span>
          </div>
          <div className="blogide-copyedit-issue-actions">
            <MiniButton primary disabled={!editor} onClick={onConvertUkDashes}>
              Convert…
            </MiniButton>
          </div>
        </li>
        {onAiCleanup && (
          <li>
            <div className="blogide-copyedit-issue-text">
              <span className="blogide-copyedit-issue-label">Messy paste overall</span>
              <span className="blogide-copyedit-issue-detail">
                AI rebuilds footnotes, headings, and block quotes and strips
                platform chrome (share buttons, &quot;subscribe&quot;). Leaves
                your prose alone.
                {!aiReady && " Needs an API key (Settings → Integrations)."}
              </span>
            </div>
            <div className="blogide-copyedit-issue-actions">
              <MiniButton
                primary
                disabled={!aiReady || aiBusy}
                onClick={() => {
                  setAiBusy(true);
                  void Promise.resolve(onAiCleanup()).finally(() => setAiBusy(false));
                }}
              >
                {aiBusy ? "Cleaning…" : "Clean with AI"}
              </MiniButton>
            </div>
          </li>
        )}
      </ul>
      <p className="blogide-cleanup-hint is-spaced">
        Straight quotes, double spaces, and stray spaces from a paste show up
        in the Check tab.
      </p>
    </section>
  );
}

/** Toolbar trigger that opens the Copyedit panel. */
export function CopyeditToolbarButton({
  open,
  onOpen,
}: {
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      title="Copyedit"
      aria-label="Copyedit"
      aria-haspopup="dialog"
      aria-expanded={open}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.8125rem] leading-none ${
        open
          ? "bg-accent/15 text-accent"
          : "text-muted hover:bg-panel hover:text-foreground"
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onOpen}
    >
      <CopyeditIcon className="blogide-tool-icon" />
    </button>
  );
}
