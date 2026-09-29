/**
 * AI copyedit passes for the Copyedit panel: small, reviewable fixes returned
 * as SEARCH/REPLACE patches, never a rewrite.
 */

import { essayChatSystem } from "@/lib/ai/client";
import type { Node as PmNode } from "@tiptap/pm/model";
import { findPatchRange, splitReplySegments } from "@/lib/ai/apply";
import {
  collectBlockTexts,
  DASH_TARGETS,
  type DashTarget,
  type TextRange,
} from "@/lib/editor/copyedit";

export type CopyeditKind = "proofread" | "consistency" | "custom";

export const COPYEDIT_KINDS: { id: Exclude<CopyeditKind, "custom">; label: string; hint: string }[] = [
  {
    id: "proofread",
    label: "Proofread",
    hint: "Spelling, grammar, typos, missing words. No style changes.",
  },
  {
    id: "consistency",
    label: "Consistency",
    hint: "Spelling variants, capitalization, numbers, hyphenation, serial comma.",
  },
];

export type CopyeditSuggestion = {
  index: number;
  label: string;
  search: string;
  replace: string;
};

const PATCH_RULES = `Return one SEARCH/REPLACE patch block per fix, each preceded by a one-line label (e.g. "Typo: teh → the"). The SEARCH is the smallest unique phrase around the problem, copied exactly from the essay (same punctuation and footnote markers). Keep each fix minimal. Never rewrite sentences for style. Do not touch footnote markers, links, code, math, or frontmatter. If there is nothing to fix, reply with one line saying so and no blocks.`;

function kindInstruction(kind: CopyeditKind, dashTarget: DashTarget, custom: string): string {
  const dash = DASH_TARGETS.find((t) => t.id === dashTarget)?.sample ?? "word—word";
  switch (kind) {
    case "proofread":
      return "Proofread for spelling, grammar, punctuation, typos, and missing or doubled words only. Leave style, word choice, voice, and intentional fragments alone.";
    case "consistency":
      return `Copyedit for consistency only. Where the essay treats the same thing two ways, pick the variant it uses most and fix the outliers: US vs UK spelling; capitalization of recurring terms; heading case (all title case or all sentence case); numbers (numerals vs words, % vs percent); hyphenation of compounds (e-mail vs email); serial comma; abbreviations and their first use. House dash style is "${dash}". Do not flag anything that is already consistent.`;
    case "custom":
      return `Copyedit for this, and nothing else: ${custom.trim()}`;
  }
}

export function buildCopyeditRequest(input: {
  kind: CopyeditKind;
  essayMarkdown: string;
  /** Limit fixes to this passage (plain text or markdown). */
  selectionText?: string | null;
  dashTarget: DashTarget;
  custom?: string;
}): { system: string; user: string } {
  const scope = input.selectionText
    ? `Only suggest fixes inside this passage (the rest of the essay is context):\n---\n${input.selectionText}\n---\n\n`
    : "";
  return {
    system: `${essayChatSystem(input.essayMarkdown)}\n\nThis is a copyedit request from BlogIDE's Copyedit panel. Reply with patch blocks only (plus their one-line labels).`,
    user: `${scope}${kindInstruction(input.kind, input.dashTarget, input.custom ?? "")}\n\n${PATCH_RULES}`,
  };
}

/** Pair each patch with the label line written just before it. */
export function parseCopyeditReply(reply: string): {
  suggestions: CopyeditSuggestion[];
  note: string;
} {
  const suggestions: CopyeditSuggestion[] = [];
  const notes: string[] = [];
  let pendingLabel = "";
  for (const segment of splitReplySegments(reply)) {
    if (segment.type === "text") {
      const lines = segment.text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      pendingLabel = (lines.pop() ?? "")
        .replace(/^[-*\d.)\s]+/, "")
        .replace(/\*\*/g, "")
        .replace(/:$/, "");
      if (lines.length) notes.push(lines.join(" "));
      continue;
    }
    if (segment.type !== "patch") continue;
    if (segment.search === segment.replace) continue;
    suggestions.push({
      index: segment.index,
      label: pendingLabel || "Fix",
      search: segment.search,
      replace: segment.replace,
    });
    pendingLabel = "";
  }
  // A trailing label with no patch is really prose ("Nothing to fix.").
  if (pendingLabel) notes.push(pendingLabel);
  return { suggestions, note: notes.join(" ").trim() };
}

/** Markdown syntax that makes a patch unsafe to apply as plain editor text. */
const MARKDOWN_SYNTAX_RE = /[*_`[\]#<>\\|~$]|^\s*(?:[-+>]|\d+\.)\s/m;

export function isPlainTextPatch(suggestion: Pick<CopyeditSuggestion, "search" | "replace">): boolean {
  return (
    !MARKDOWN_SYNTAX_RE.test(suggestion.search) &&
    !MARKDOWN_SYNTAX_RE.test(suggestion.replace) &&
    !suggestion.search.includes("\n\n") &&
    !suggestion.replace.includes("\n")
  );
}

/**
 * Find a plain-text patch's SEARCH in the rich-text editor (tolerating the
 * quote / dash / whitespace drift models introduce). Null when absent.
 */
export function locatePlainText(doc: PmNode, search: string): TextRange | null {
  const needle = search.trim();
  if (!needle) return null;
  for (const block of collectBlockTexts(doc)) {
    const range = findPatchRange(block.text, needle);
    if (range) {
      return { from: block.start + range.from, to: block.start + range.to };
    }
  }
  return null;
}
