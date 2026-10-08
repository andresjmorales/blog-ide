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

/** Inline marks Find can apply to every match at once. */
export type FindFormatMark = "bold" | "italic" | "strike";

/** Markdown delimiters for marks applied inside footnote `content` attrs. */
const FOOTNOTE_DELIMITERS: Record<FindFormatMark, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
};

/**
 * Whether `content[from, to)` sits directly inside this mark's markdown
 * delimiters. Italic must not mistake the inner `*` of `**bold**` for its
 * own (but `***both***` counts as italic).
 */
function footnoteRangeHasMark(
  content: string,
  from: number,
  to: number,
  mark: FindFormatMark
): boolean {
  const delim = FOOTNOTE_DELIMITERS[mark];
  const n = delim.length;
  if (from < n || to + n > content.length) return false;
  if (content.slice(from - n, from) !== delim) return false;
  if (content.slice(to, to + n) !== delim) return false;
  if (mark === "italic") {
    const before = content.slice(Math.max(0, from - 3), from);
    const after = content.slice(to, to + 3);
    const starsBefore = before.length - before.replace(/\*+$/, "").length;
    const starsAfter = after.length - after.replace(/^\*+/, "").length;
    return starsBefore % 2 === 1 && starsAfter % 2 === 1;
  }
  return true;
}

function docRangeHasMark(
  editor: Editor,
  from: number,
  to: number,
  mark: FindFormatMark
): boolean {
  const type = editor.state.schema.marks[mark];
  if (!type) return false;
  let all = true;
  let sawText = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    sawText = true;
    if (!type.isInSet(node.marks)) all = false;
  });
  return sawText && all;
}

/** True when every match already carries `mark` (so applying it toggles off). */
export function matchesHaveMark(
  editor: Editor,
  matches: FindMatch[],
  mark: FindFormatMark
): boolean {
  if (matches.length === 0) return false;
  return matches.every((match) => {
    if (match.footnotePos != null) {
      const node = editor.state.doc.nodeAt(match.footnotePos);
      if (!node || node.type.name !== "footnoteRef") return false;
      return footnoteRangeHasMark(
        String(node.attrs.content ?? ""),
        match.from,
        match.to,
        mark
      );
    }
    return docRangeHasMark(editor, match.from, match.to, mark);
  });
}

/**
 * Toggle an inline mark on the given matches in one transaction (one undo
 * step). If every match already has the mark it is removed; otherwise it is
 * added to all of them. Footnote bodies are markdown, so their matches are
 * wrapped in (or unwrapped from) the mark's delimiters instead.
 * Returns whether the mark was added and how many matches changed.
 */
export function toggleMarkOnMatches(
  editor: Editor,
  matches: FindMatch[],
  mark: FindFormatMark
): { added: boolean; count: number } {
  const type = editor.state.schema.marks[mark];
  if (!type || matches.length === 0) return { added: false, count: 0 };
  const remove = matchesHaveMark(editor, matches, mark);
  const delim = FOOTNOTE_DELIMITERS[mark];
  let tr = editor.state.tr;
  let count = 0;

  // Mark steps never shift positions; footnote edits only change an atom's
  // attrs. Bottom-up keeps earlier offsets inside one note's content valid.
  const ordered = [...matches].sort((a, b) => {
    const key = matchSortKey(b) - matchSortKey(a);
    if (key !== 0) return key;
    return b.from - a.from;
  });

  for (const match of ordered) {
    if (match.footnotePos != null) {
      const node = tr.doc.nodeAt(match.footnotePos);
      if (!node || node.type.name !== "footnoteRef") continue;
      const content = String(node.attrs.content ?? "");
      const has = footnoteRangeHasMark(content, match.from, match.to, mark);
      let updated: string;
      if (remove) {
        if (!has) continue;
        updated =
          content.slice(0, match.from - delim.length) +
          content.slice(match.from, match.to) +
          content.slice(match.to + delim.length);
      } else {
        if (has) continue;
        updated =
          content.slice(0, match.from) +
          delim +
          content.slice(match.from, match.to) +
          delim +
          content.slice(match.to);
      }
      tr = tr.setNodeMarkup(match.footnotePos, undefined, {
        ...node.attrs,
        content: updated,
      });
      count += 1;
      continue;
    }
    if (remove) {
      tr = tr.removeMark(match.from, match.to, type);
    } else {
      tr = tr.addMark(match.from, match.to, type.create());
    }
    count += 1;
  }

  if (tr.docChanged) {
    editor.view.dispatch(tr);
  }
  return { added: !remove, count };
}
