import type { Editor } from "@tiptap/core";
import {
  applyReplacement,
  findMatchesInText,
  type FindMatch,
  type FindReplaceOptions,
  type FindScope,
} from "@/lib/editor/findReplace";

export type DocRange = { from: number; to: number };

function scopeRange(
  editor: Editor,
  scope: FindScope,
  stickyRange?: DocRange | null
): DocRange {
  const { doc, selection } = editor.state;
  if (scope === "selection") {
    if (stickyRange && stickyRange.from < stickyRange.to) {
      const from = Math.max(0, Math.min(stickyRange.from, doc.content.size));
      const to = Math.max(from, Math.min(stickyRange.to, doc.content.size));
      return { from, to };
    }
    if (!selection.empty) {
      return { from: selection.from, to: selection.to };
    }
  }
  return { from: 0, to: doc.content.size };
}

function matchSortKey(match: FindMatch): number {
  return match.footnotePos ?? match.from;
}

/**
 * Collect matches by walking **text nodes** and footnote `content` attrs so
 * nested note bodies are searchable without flattening the doc.
 */
export function findInEditor(
  editor: Editor,
  options: Pick<FindReplaceOptions, "query" | "regex" | "caseSensitive">,
  scope: FindScope,
  stickyRange?: DocRange | null
): FindMatch[] {
  const { from, to } = scopeRange(editor, scope, stickyRange);
  const matches: FindMatch[] = [];

  editor.state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.type.name === "codeBlock") {
      return false;
    }

    if (node.type.name === "footnoteRef") {
      if (scope === "headings") {
        return false;
      }
      // Atom must start inside the scope (nodesBetween can visit straddling nodes).
      if (pos < from || pos >= to) {
        return false;
      }
      const content = String(node.attrs.content ?? "");
      if (!content) {
        return false;
      }
      for (const match of findMatchesInText(content, options, 0)) {
        matches.push({
          ...match,
          footnotePos: pos,
        });
      }
      return false;
    }

    if (!node.isText || !node.text) {
      return;
    }
    if (node.marks.some((mark) => mark.type.name === "code")) {
      return;
    }
    if (scope === "headings" && parent?.type.name !== "heading") {
      return;
    }

    const nodeFrom = pos;
    const nodeTo = pos + node.text.length;
    const sliceFrom = Math.max(from, nodeFrom);
    const sliceTo = Math.min(to, nodeTo);
    if (sliceFrom >= sliceTo) {
      return;
    }
    const slice = node.text.slice(sliceFrom - nodeFrom, sliceTo - nodeFrom);
    matches.push(...findMatchesInText(slice, options, sliceFrom));
  });

  matches.sort((a, b) => {
    const key = matchSortKey(a) - matchSortKey(b);
    if (key !== 0) return key;
    return a.from - b.from;
  });

  return matches;
}

export function selectMatch(editor: Editor, match: FindMatch): void {
  if (match.footnotePos != null) {
    editor
      .chain()
      .focus()
      .setNodeSelection(match.footnotePos)
      .run();
    return;
  }
  editor
    .chain()
    .focus()
    .setTextSelection({ from: match.from, to: match.to })
    .run();
}

function replacementForMatch(
  match: FindMatch,
  options: FindReplaceOptions
): string {
  let next = options.replacement;
  if (options.regex) {
    const re = new RegExp(options.query, options.caseSensitive ? "" : "i");
    const exec = re.exec(match.text);
    if (exec) {
      next = applyReplacement(exec, options.replacement);
    }
  }
  return next;
}

/**
 * Replace a single match inside a text node or footnote content attr.
 * Returns length delta (new − old) for sticky-range updates (0 for footnotes).
 */
export function replaceMatch(
  editor: Editor,
  match: FindMatch,
  options: FindReplaceOptions
): number {
  const next = replacementForMatch(match, options);
  const { state } = editor;

  if (match.footnotePos != null) {
    const node = state.doc.nodeAt(match.footnotePos);
    if (!node || node.type.name !== "footnoteRef") {
      return 0;
    }
    const content = String(node.attrs.content ?? "");
    const updated =
      content.slice(0, match.from) + next + content.slice(match.to);
    const tr = state.tr.setNodeMarkup(match.footnotePos, undefined, {
      ...node.attrs,
      content: updated,
    });
    editor.view.dispatch(tr);
    // Atom size unchanged — sticky doc range does not shift.
    return 0;
  }

  const $from = state.doc.resolve(match.from);
  const marks = $from.marks();
  const tr = state.tr.replaceWith(
    match.from,
    match.to,
    state.schema.text(next, marks)
  );
  editor.view.dispatch(tr);
  return next.length - (match.to - match.from);
}

/**
 * Replace all matches in scope in one transaction (bottom-up).
 * Returns count and the sticky range after mapping (if provided).
 */
export function replaceAllInEditor(
  editor: Editor,
  options: FindReplaceOptions,
  scope: FindScope,
  stickyRange?: DocRange | null
): { count: number; stickyRange: DocRange | null } {
  const matches = findInEditor(editor, options, scope, stickyRange);
  if (matches.length === 0) {
    return { count: 0, stickyRange: stickyRange ?? null };
  }

  const { state } = editor;
  let tr = state.tr;
  const ordered = [...matches].sort((a, b) => {
    const key = matchSortKey(b) - matchSortKey(a);
    if (key !== 0) return key;
    return b.from - a.from;
  });

  for (const match of ordered) {
    const next = replacementForMatch(match, options);
    if (match.footnotePos != null) {
      const mappedPos = tr.mapping.map(match.footnotePos);
      const node = tr.doc.nodeAt(mappedPos);
      if (!node || node.type.name !== "footnoteRef") {
        continue;
      }
      const content = String(node.attrs.content ?? "");
      const updated =
        content.slice(0, match.from) + next + content.slice(match.to);
      tr = tr.setNodeMarkup(mappedPos, undefined, {
        ...node.attrs,
        content: updated,
      });
      continue;
    }
    const from = tr.mapping.map(match.from);
    const to = tr.mapping.map(match.to);
    const marks = tr.doc.resolve(from).marks();
    tr = tr.replaceWith(from, to, state.schema.text(next, marks));
  }

  let nextSticky = stickyRange ?? null;
  if (nextSticky && tr.docChanged) {
    nextSticky = {
      from: tr.mapping.map(nextSticky.from),
      to: tr.mapping.map(nextSticky.to),
    };
  }

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }
  return { count: matches.length, stickyRange: nextSticky };
}
