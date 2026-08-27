import { SuggestionKind } from "harper.js";
import type { HarperSuggestion, HarperSuggestionKind } from "@/lib/editor/harper/types";

export function parseHarperSuggestionKind(kind: unknown): HarperSuggestionKind {
  if (kind === SuggestionKind.Remove || kind === "Remove" || kind === 1) {
    return "remove";
  }
  if (kind === SuggestionKind.InsertAfter || kind === "InsertAfter" || kind === 2) {
    return "insertAfter";
  }
  return "replace";
}

export function fromHarperSuggestion(item: {
  kind?: (() => unknown) | unknown;
  get_replacement_text?: () => string;
}): HarperSuggestion {
  const raw = typeof item.kind === "function" ? item.kind() : item.kind;
  return {
    kind: parseHarperSuggestionKind(raw),
    text: item.get_replacement_text?.() ?? "",
  };
}

export function keepHarperSuggestion(suggestion: HarperSuggestion): boolean {
  return suggestion.kind === "remove" || suggestion.text.length > 0;
}

/** Map a Harper suggestion onto a ProseMirror insert/replace range. */
export function suggestionRange(
  from: number,
  to: number,
  suggestion: HarperSuggestion
): { from: number; to: number; text: string } {
  if (suggestion.kind === "remove") {
    return { from, to, text: "" };
  }
  if (suggestion.kind === "insertAfter") {
    return { from: to, to: to, text: suggestion.text };
  }
  return { from, to, text: suggestion.text };
}

/** Button label: show the resulting text, not a bare "," insert. */
export function suggestionLabel(
  problem: string,
  suggestion: HarperSuggestion
): string {
  if (suggestion.kind === "remove") {
    return problem ? `Remove “${problem}”` : "Remove";
  }
  if (suggestion.kind === "insertAfter") {
    return `${problem}${suggestion.text}`;
  }
  return suggestion.text;
}

export function suggestionsKey(suggestions: HarperSuggestion[]): string {
  return suggestions.map((item) => `${item.kind}:${item.text}`).join("\0");
}
