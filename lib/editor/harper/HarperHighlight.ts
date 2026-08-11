import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/core";
import type { Dialect } from "harper.js";
import { extractLintText, mapSpanToRange } from "@/lib/editor/harper/extractText";
import { getHarperLinter } from "@/lib/editor/harper/linter";
import {
  EMPTY_HARPER_STATE,
  type HarperHighlightState,
  type HarperIssue,
} from "@/lib/editor/harper/types";

export const harperHighlightKey = new PluginKey<HarperHighlightState>(
  "blogideHarperHighlight"
);

const SPELLING_KINDS = new Set(["Spelling", "Typo"]);

type HarperStorage = {
  enabled: boolean;
  dialect: Dialect | null;
  requestId: number;
  ignored: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    harperHighlight: {
      setHarperEnabled: (enabled: boolean) => ReturnType;
      setHarperDialect: (dialect: Dialect | null) => ReturnType;
      setHarperActiveIssue: (id: string | null) => ReturnType;
      applyHarperSuggestion: (id: string, replacement: string) => ReturnType;
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
  return SPELLING_KINDS.has(kind)
    ? "blogide-harper-lint is-spelling"
    : "blogide-harper-lint is-grammar";
}

function scheduleLint(editor: Editor) {
  const storage = editor.storage.harperHighlight;
  if (storage.timer) clearTimeout(storage.timer);
  storage.timer = setTimeout(() => {
    storage.timer = null;
    void runLint(editor);
  }, 420);
}

async function runLint(editor: Editor) {
  if (editor.isDestroyed) return;
  const storage = editor.storage.harperHighlight;
  if (!storage.enabled || storage.dialect == null) {
    setHarperState(editor, { issues: [], activeId: null });
    return;
  }

  const requestId = ++storage.requestId;
  const { text, posAt, endPosAt } = extractLintText(editor.state.doc);
  if (!text.trim()) {
    if (requestId === storage.requestId) {
      setHarperState(editor, { issues: [], activeId: null });
    }
    return;
  }

  try {
    const linter = await getHarperLinter(storage.dialect);
    if (editor.isDestroyed || requestId !== storage.requestId) return;
    const lints = await linter.lint(text, { language: "plaintext" });
    if (editor.isDestroyed || requestId !== storage.requestId) return;

    const map = { text, posAt, endPosAt };
    const issues: HarperIssue[] = [];
    for (let i = 0; i < lints.length; i++) {
      const lint = lints[i];
      const span = lint.span();
      const range = mapSpanToRange(map, span.start, span.end);
      if (!range) continue;
      const issue: HarperIssue = {
        id: `${range.from}-${range.to}-${i}-${lint.lint_kind()}`,
        from: range.from,
        to: range.to,
        kind: lint.lint_kind(),
        message: lint.message(),
        problem: lint.get_problem_text(),
        suggestions: lint
          .suggestions()
          .map((s) => s.get_replacement_text())
          .filter((s) => s.length > 0)
          .slice(0, 5),
      };
      if (storage.ignored.has(issueKey(issue))) continue;
      issues.push(issue);
    }

    const prev = harperHighlightKey.getState(editor.state);
    const activeStill =
      prev?.activeId && issues.some((issue) => issue.id === prev.activeId)
        ? prev.activeId
        : null;
    setHarperState(editor, { issues, activeId: activeStill });
  } catch (error) {
    console.warn("[harper] lint failed", error);
  }
}

function setHarperState(editor: Editor, state: HarperHighlightState) {
  if (editor.isDestroyed) return;
  const tr = editor.state.tr.setMeta(harperHighlightKey, state);
  // Avoid adding to history / scrolling.
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
      timer: null,
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
          storage.dialect = dialect;
          if (storage.enabled) scheduleLint(editor);
          else setHarperState(editor, EMPTY_HARPER_STATE);
          return true;
        },
      setHarperActiveIssue:
        (id: string | null) =>
        ({ editor }) => {
          const current = getHarperState(editor);
          setHarperState(editor, { ...current, activeId: id });
          return true;
        },
      applyHarperSuggestion:
        (id: string, replacement: string) =>
        ({ editor, tr, dispatch }) => {
          const issue = getHarperState(editor).issues.find((i) => i.id === id);
          if (!issue) return false;
          if (dispatch) {
            tr.insertText(replacement, issue.from, issue.to);
            tr.setMeta(harperHighlightKey, {
              issues: [],
              activeId: null,
            } satisfies HarperHighlightState);
            dispatch(tr);
            scheduleLint(editor);
          }
          return true;
        },
      ignoreHarperIssue:
        (id: string) =>
        ({ editor }) => {
          const storage = editor.storage.harperHighlight;
          const issue = getHarperState(editor).issues.find((i) => i.id === id);
          if (!issue) return false;
          storage.ignored.add(issueKey(issue));
          const next = getHarperState(editor).issues.filter((i) => i.id !== id);
          setHarperState(editor, { issues: next, activeId: null });
          return true;
        },
      refreshHarperLint:
        () =>
        ({ editor }) => {
          scheduleLint(editor);
          return true;
        },
    };
  },

  onCreate() {
    scheduleLint(this.editor);
  },

  onDestroy() {
    const storage = this.editor.storage.harperHighlight;
    if (storage.timer) clearTimeout(storage.timer);
  },

  addProseMirrorPlugins() {
    const extensionEditor = this.editor;
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
            // Drop stale underlines on edit; a debounced re-lint restores them.
            return EMPTY_HARPER_STATE;
          },
        },
        view() {
          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) {
                scheduleLint(extensionEditor);
              }
            },
          };
        },
        props: {
          decorations(state) {
            const pluginState = harperHighlightKey.getState(state);
            if (!pluginState || pluginState.issues.length === 0) return null;
            const decos = pluginState.issues.map((issue) =>
              Decoration.inline(issue.from, issue.to, {
                class:
                  issue.id === pluginState.activeId
                    ? `${underlineClass(issue.kind)} is-active`
                    : underlineClass(issue.kind),
                "data-harper-id": issue.id,
              })
            );
            return DecorationSet.create(state.doc, decos);
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
