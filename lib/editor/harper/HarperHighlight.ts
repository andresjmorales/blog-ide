import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import type { Dialect, Linter } from "harper.js";
import {
  extractLintBlocks,
  lintDocumentKey,
  mapSpanToRange,
  type LintBlock,
} from "@/lib/editor/harper/extractText";
import { dictionaryHasWord, wordKey } from "@/lib/editor/harper/dictionary";
import { isHarperSpellingKind } from "@/lib/editor/harper/kinds";
import {
  getHarperLinter,
  setDesiredHarperDictionary,
} from "@/lib/editor/harper/linter";
import {
  cacheGet,
  cacheSet,
  issuesFingerprint,
  mapHarperState,
  preserveActiveId,
} from "@/lib/editor/harper/mapIssues";
import {
  fromHarperSuggestion,
  keepHarperSuggestion,
  suggestionRange,
} from "@/lib/editor/harper/suggestions";
import {
  EMPTY_HARPER_STATE,
  type CachedHarperSpan,
  type HarperHighlightState,
  type HarperIssue,
} from "@/lib/editor/harper/types";

export const harperHighlightKey = new PluginKey<HarperHighlightState>(
  "blogideHarperHighlight"
);

/** Pause after the last keystroke before talking to Harper. Squiggles stay. */
const LINT_DEBOUNCE_MS = 400;

type HarperStorage = {
  enabled: boolean;
  dialect: Dialect | null;
  requestId: number;
  ignored: Set<string>;
  disabledKinds: Set<string>;
  dictionary: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
  blockCache: Map<string, CachedHarperSpan[]>;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    harperHighlight: {
      setHarperEnabled: (enabled: boolean) => ReturnType;
      setHarperDialect: (dialect: Dialect | null) => ReturnType;
      setHarperActiveIssue: (id: string | null) => ReturnType;
      setHarperDisabledKinds: (kinds: string[]) => ReturnType;
      setHarperDictionary: (words: string[]) => ReturnType;
      applyHarperSuggestion: (id: string, suggestionIndex: number) => ReturnType;
      ignoreHarperIssue: (id: string) => ReturnType;
      refreshHarperLint: () => ReturnType;
    };
  }
  interface Storage {
    harperHighlight: HarperStorage;
  }
}

function issueKey(issue: Pick<HarperIssue, "kind" | "problem" | "message">) {
  return `${issue.kind}\0${issue.problem}\0${issue.message}`;
}

function underlineClass(kind: string): string {
  return isHarperSpellingKind(kind)
    ? "blogide-harper-lint is-spelling"
    : "blogide-harper-lint is-grammar";
}

function sameStringSet(left: Set<string>, right: Iterable<string>): boolean {
  const next = right instanceof Set ? right : new Set(right);
  if (left.size !== next.size) return false;
  for (const item of left) {
    if (!next.has(item)) return false;
  }
  return true;
}

function scheduleLint(editor: Editor) {
  const storage = editor.storage.harperHighlight;
  if (!storage.enabled || storage.dialect == null) return;
  if (storage.timer) clearTimeout(storage.timer);
  storage.timer = setTimeout(() => {
    storage.timer = null;
    if (editor.isDestroyed) return;
    if (editor.view.composing) {
      scheduleLint(editor);
      return;
    }
    void runLint(editor);
  }, LINT_DEBOUNCE_MS);
}

function shouldKeepIssue(
  issue: Pick<HarperIssue, "kind" | "problem" | "message">,
  storage: Pick<HarperStorage, "ignored" | "disabledKinds" | "dictionary">
): boolean {
  if (storage.ignored.has(issueKey(issue))) return false;
  if (storage.disabledKinds.has(issue.kind)) return false;
  if (
    isHarperSpellingKind(issue.kind) &&
    dictionaryHasWord(storage.dictionary, issue.problem)
  ) {
    return false;
  }
  return true;
}

function spansToIssues(
  block: LintBlock,
  spans: CachedHarperSpan[],
  storage: Pick<HarperStorage, "ignored" | "disabledKinds" | "dictionary">
): HarperIssue[] {
  const issues: HarperIssue[] = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const range = mapSpanToRange(block, span.start, span.end);
    if (!range) continue;
    const issue: HarperIssue = {
      id: `${range.from}-${range.to}-${span.kind}-${i}`,
      from: range.from,
      to: range.to,
      kind: span.kind,
      message: span.message,
      problem: span.problem,
      suggestions: span.suggestions,
    };
    if (!shouldKeepIssue(issue, storage)) continue;
    issues.push(issue);
  }
  return issues;
}

function lintToSpan(lint: {
  span: () => { start: number; end: number };
  lint_kind: () => string;
  message: () => string;
  get_problem_text: () => string;
  suggestions: () => Array<{
    kind?: (() => unknown) | unknown;
    get_replacement_text: () => string;
  }>;
}): CachedHarperSpan {
  const span = lint.span();
  return {
    start: span.start,
    end: span.end,
    kind: lint.lint_kind(),
    message: lint.message(),
    problem: lint.get_problem_text(),
    suggestions: lint
      .suggestions()
      .map(fromHarperSuggestion)
      .filter(keepHarperSuggestion)
      .slice(0, 5),
  };
}

async function lintDirtyBlocks(
  linter: Linter,
  dirty: LintBlock[]
): Promise<Map<LintBlock, CachedHarperSpan[]>> {
  const byBlock = new Map<LintBlock, CachedHarperSpan[]>();
  for (const block of dirty) byBlock.set(block, []);
  if (dirty.length === 0) return byBlock;

  const joined = dirty.map((block) => block.text).join("\n\n");
  const lints = await linter.lint(joined, { language: "plaintext" });
  const starts: number[] = [];
  let offset = 0;
  for (const block of dirty) {
    starts.push(offset);
    offset += block.text.length + 2;
  }

  for (const lint of lints) {
    const span = lint.span();
    for (let i = 0; i < dirty.length; i++) {
      const start = starts[i];
      const end = start + dirty[i].text.length;
      if (span.start >= start && span.end <= end) {
        const local = lintToSpan(lint);
        local.start = span.start - start;
        local.end = span.end - start;
        byBlock.get(dirty[i])!.push(local);
        break;
      }
    }
  }
  return byBlock;
}

async function runLint(editor: Editor) {
  if (editor.isDestroyed) return;
  const storage = editor.storage.harperHighlight;
  if (!storage.enabled || storage.dialect == null) {
    const current = harperHighlightKey.getState(editor.state);
    if (current && (current.issues.length > 0 || current.activeId)) {
      setHarperState(editor, EMPTY_HARPER_STATE);
    }
    return;
  }

  const requestId = ++storage.requestId;
  const blocks = extractLintBlocks(editor.state.doc);
  const startedKey = lintDocumentKey(blocks);
  if (!startedKey.trim()) {
    if (requestId === storage.requestId) {
      setHarperState(editor, EMPTY_HARPER_STATE);
    }
    return;
  }

  const dirty: LintBlock[] = [];
  const issues: HarperIssue[] = [];
  for (const block of blocks) {
    if (!block.text.trim()) continue;
    const hit = cacheGet(storage.blockCache, block.text);
    if (hit) {
      issues.push(...spansToIssues(block, hit, storage));
    } else {
      dirty.push(block);
    }
  }

  if (dirty.length > 0) {
    try {
      const linter = await getHarperLinter(storage.dialect);
      if (editor.isDestroyed) return;
      const byBlock = await lintDirtyBlocks(linter, dirty);
      for (const block of dirty) {
        const spans = byBlock.get(block) ?? [];
        cacheSet(storage.blockCache, block.text, spans);
        issues.push(...spansToIssues(block, spans, storage));
      }
    } catch (error) {
      console.warn("[harper] lint failed", error);
      return;
    }
  }

  if (editor.isDestroyed || requestId !== storage.requestId) return;
  const currentBlocks = extractLintBlocks(editor.state.doc);
  if (lintDocumentKey(currentBlocks) !== startedKey) return;

  issues.sort((a, b) => a.from - b.from || a.to - b.to);
  const prev = harperHighlightKey.getState(editor.state) ?? EMPTY_HARPER_STATE;
  const activeId = preserveActiveId(prev, issues);
  if (
    issuesFingerprint(prev.issues) === issuesFingerprint(issues) &&
    prev.activeId === activeId
  ) {
    return;
  }
  setHarperState(editor, { issues, activeId });
}

function setHarperState(editor: Editor, state: HarperHighlightState) {
  if (editor.isDestroyed) return;
  const tr = editor.state.tr.setMeta(harperHighlightKey, state);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
}

export function getHarperState(editor: Editor): HarperHighlightState {
  return harperHighlightKey.getState(editor.state) ?? EMPTY_HARPER_STATE;
}

export const HarperHighlight = Extension.create({
  name: "harperHighlight",

  addStorage() {
    return {
      enabled: false,
      dialect: null,
      requestId: 0,
      ignored: new Set<string>(),
      disabledKinds: new Set<string>(),
      dictionary: new Set<string>(),
      timer: null,
      blockCache: new Map(),
    } satisfies HarperStorage;
  },

  addCommands() {
    return {
      setHarperEnabled:
        (enabled: boolean) =>
        ({ editor }) => {
          const storage = editor.storage.harperHighlight;
          storage.enabled = enabled;
          if (!enabled) {
            if (storage.timer) clearTimeout(storage.timer);
            storage.timer = null;
            storage.requestId += 1;
            setHarperState(editor, EMPTY_HARPER_STATE);
          } else {
            scheduleLint(editor);
          }
          return true;
        },
      setHarperDialect:
        (dialect: Dialect | null) =>
        ({ editor }) => {
          const storage = editor.storage.harperHighlight;
          if (storage.dialect === dialect) return true;
          storage.dialect = dialect;
          storage.blockCache.clear();
          if (storage.enabled && dialect != null) scheduleLint(editor);
          else setHarperState(editor, EMPTY_HARPER_STATE);
          return true;
        },
      setHarperActiveIssue:
        (id: string | null) =>
        ({ editor }) => {
          const current = getHarperState(editor);
          if (current.activeId === id) return true;
          setHarperState(editor, { ...current, activeId: id });
          return true;
        },
      setHarperDisabledKinds:
        (kinds: string[]) =>
        ({ editor }) => {
          const storage = editor.storage.harperHighlight;
          if (sameStringSet(storage.disabledKinds, kinds)) return true;
          storage.disabledKinds = new Set(kinds);
          const current = getHarperState(editor);
          const issues = current.issues.filter((issue) =>
            shouldKeepIssue(issue, storage)
          );
          const activeId =
            current.activeId && issues.some((issue) => issue.id === current.activeId)
              ? current.activeId
              : null;
          setHarperState(editor, { issues, activeId });
          scheduleLint(editor);
          return true;
        },
      setHarperDictionary:
        (words: string[]) =>
        ({ editor }) => {
          const storage = editor.storage.harperHighlight;
          const next = new Set(words.map(wordKey).filter(Boolean));
          if (sameStringSet(storage.dictionary, next)) return true;
          storage.dictionary = next;
          setDesiredHarperDictionary(words);
          storage.blockCache.clear();
          const current = getHarperState(editor);
          const issues = current.issues.filter((issue) =>
            shouldKeepIssue(issue, storage)
          );
          const activeId =
            current.activeId && issues.some((issue) => issue.id === current.activeId)
              ? current.activeId
              : null;
          setHarperState(editor, { issues, activeId });
          scheduleLint(editor);
          return true;
        },
      applyHarperSuggestion:
        (id: string, suggestionIndex: number) =>
        ({ editor, tr, dispatch }) => {
          const issue = getHarperState(editor).issues.find((item) => item.id === id);
          if (!issue) return false;
          const suggestion = issue.suggestions[suggestionIndex];
          if (!suggestion) return false;
          if (dispatch) {
            const edit = suggestionRange(issue.from, issue.to, suggestion);
            tr.insertText(edit.text, edit.from, edit.to);
            dispatch(tr);
            scheduleLint(editor);
          }
          return true;
        },
      ignoreHarperIssue:
        (id: string) =>
        ({ editor }) => {
          const storage = editor.storage.harperHighlight;
          const issue = getHarperState(editor).issues.find((item) => item.id === id);
          if (!issue) return false;
          storage.ignored.add(issueKey(issue));
          const next = getHarperState(editor).issues.filter((item) => item.id !== id);
          setHarperState(editor, { issues: next, activeId: null });
          return true;
        },
      refreshHarperLint:
        () =>
        ({ editor }) => {
          editor.storage.harperHighlight.blockCache.clear();
          scheduleLint(editor);
          return true;
        },
    };
  },

  onCreate() {
    if (this.editor.storage.harperHighlight.enabled) {
      scheduleLint(this.editor);
    }
  },

  onDestroy() {
    const storage = this.editor.storage.harperHighlight;
    if (storage.timer) clearTimeout(storage.timer);
  },

  addProseMirrorPlugins() {
    const extensionEditor = this.editor;
    let lastDecoState: HarperHighlightState | null = null;
    let lastDecoSet: DecorationSet | null = null;
    return [
      new Plugin<HarperHighlightState>({
        key: harperHighlightKey,
        state: {
          init: () => EMPTY_HARPER_STATE,
          apply(tr, value) {
            const meta = tr.getMeta(harperHighlightKey) as
              | HarperHighlightState
              | undefined;
            if (meta) return meta;
            if (!tr.docChanged) return value;
            return mapHarperState(value, tr);
          },
        },
        view() {
          return {
            update(view, prevState) {
              if (view.state.doc.eq(prevState.doc)) return;
              scheduleLint(extensionEditor);
            },
          };
        },
        props: {
          decorations(state) {
            const pluginState = harperHighlightKey.getState(state);
            if (!pluginState || pluginState.issues.length === 0) return null;
            if (pluginState === lastDecoState && lastDecoSet) {
              return lastDecoSet;
            }
            const decos = pluginState.issues.map((issue) =>
              Decoration.inline(issue.from, issue.to, {
                class:
                  issue.id === pluginState.activeId
                    ? `${underlineClass(issue.kind)} is-active`
                    : underlineClass(issue.kind),
                "data-harper-id": issue.id,
              })
            );
            lastDecoState = pluginState;
            lastDecoSet = DecorationSet.create(state.doc, decos);
            return lastDecoSet;
          },
          handleClick(view, _pos, event) {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return false;
            const mark = target.closest("[data-harper-id]");
            if (!(mark instanceof HTMLElement)) {
              const current = harperHighlightKey.getState(view.state);
              if (current?.activeId) {
                extensionEditor.commands.setHarperActiveIssue(null);
              }
              return false;
            }
            const id = mark.getAttribute("data-harper-id");
            if (!id) return false;
            extensionEditor.commands.setHarperActiveIssue(id);
            return true;
          },
        },
      }),
    ];
  },
});
