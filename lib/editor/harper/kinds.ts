/** Harper lint_kind() values we surface in settings. Unknown kinds stay enabled. */
export const HARPER_LINT_KIND_GROUPS: Array<{
  id: string;
  label: string;
  kinds: Array<{ id: string; label: string; hint?: string }>;
}> = [
  {
    id: "spelling",
    label: "Spelling",
    kinds: [
      { id: "Spelling", label: "Spelling" },
      { id: "Typo", label: "Typos" },
    ],
  },
  {
    id: "grammar",
    label: "Grammar",
    kinds: [
      { id: "Grammar", label: "Grammar" },
      { id: "Agreement", label: "Agreement" },
      { id: "WordOrder", label: "Word order" },
      { id: "BoundaryError", label: "Word boundaries" },
    ],
  },
  {
    id: "punctuation",
    label: "Punctuation and formatting",
    kinds: [
      { id: "Punctuation", label: "Punctuation" },
      { id: "Capitalization", label: "Capitalization" },
      { id: "Formatting", label: "Formatting" },
    ],
  },
  {
    id: "style",
    label: "Style and clarity",
    kinds: [
      {
        id: "Readability",
        label: "Readability",
        hint: "Long sentences and similar",
      },
      { id: "Style", label: "Style" },
      { id: "WordChoice", label: "Word choice" },
      { id: "Redundancy", label: "Redundancy" },
      { id: "Repetition", label: "Repetition" },
      { id: "Usage", label: "Usage" },
      { id: "Enhancement", label: "Enhancement" },
    ],
  },
  {
    id: "other",
    label: "Other",
    kinds: [
      { id: "Eggcorn", label: "Eggcorns" },
      { id: "Malapropism", label: "Malapropisms" },
      { id: "Nonstandard", label: "Nonstandard" },
      { id: "Regionalism", label: "Regionalisms" },
      { id: "Miscellaneous", label: "Miscellaneous" },
    ],
  },
];

const SPELLING_KINDS = new Set(["Spelling", "Typo"]);

export function isHarperSpellingKind(kind: string): boolean {
  return SPELLING_KINDS.has(kind);
}

export function harperKindLabel(kind: string): string {
  for (const group of HARPER_LINT_KIND_GROUPS) {
    const match = group.kinds.find((item) => item.id === kind);
    if (match) return match.label;
  }
  return kind;
}

export function normalizeHarperDisabledKinds(
  kinds: string[] | undefined
): string[] {
  if (!Array.isArray(kinds)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of kinds) {
    if (typeof raw !== "string") continue;
    const kind = raw.trim();
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    out.push(kind);
  }
  return out;
}

export function setHarperKindEnabled(
  disabled: string[],
  kind: string,
  enabled: boolean
): string[] {
  const next = new Set(normalizeHarperDisabledKinds(disabled));
  if (enabled) next.delete(kind);
  else next.add(kind);
  return [...next];
}

export function harperKindEnabled(
  disabled: string[] | Set<string>,
  kind: string
): boolean {
  if (disabled instanceof Set) return !disabled.has(kind);
  return !disabled.includes(kind);
}
