/**
 * Canned AI actions for the sidebar — short, essay-aware prompts.
 */

export type AiActionId = "critique" | "tighten" | "title" | "expand";

export type AiAction = {
  id: AiActionId;
  label: string;
  /** Shown on the chip / button title. */
  title: string;
  /** Whether Apply is usually useful for this action's reply. */
  expectRewrite: boolean;
  /** Prefer selection when present; otherwise whole essay. */
  preferSelection: boolean;
};

export const AI_ACTIONS: AiAction[] = [
  {
    id: "critique",
    label: "Critique",
    title: "Honest editorial feedback (no rewrite)",
    expectRewrite: false,
    preferSelection: true,
  },
  {
    id: "tighten",
    label: "Tighten",
    title: "Cut fluff; keep voice and meaning",
    expectRewrite: true,
    preferSelection: true,
  },
  {
    id: "title",
    label: "Title",
    title: "Suggest a sharper title for the essay",
    expectRewrite: true,
    preferSelection: false,
  },
  {
    id: "expand",
    label: "Expand",
    title: "Develop the selection or thin passage",
    expectRewrite: true,
    preferSelection: true,
  },
];

export function actionUserPrompt(
  action: AiActionId,
  scope: "essay" | "selection"
): string {
  const target =
    scope === "selection"
      ? "the selected passage (in context of the essay)"
      : "this essay";

  switch (action) {
    case "critique":
      return `Critique ${target}. Be specific and useful: argument, clarity, structure, prose, and footnote use if relevant. Do not rewrite the whole piece — short bullets and a brief overall take.`;
    case "tighten":
      return scope === "selection"
        ? "Tighten the selected passage. Return ONLY the revised passage as markdown (no preamble, no code fences). Keep meaning, voice, and any footnote markers. Do not invent new claims."
        : "Tighten this essay. Return ONLY the complete revised markdown document (keep frontmatter if present). Cut fluff and repetition; keep voice, meaning, structure, and footnote markers/definitions. No preamble.";
    case "title":
      return `Propose 3 sharper titles for this essay, then pick one best title on its own final line as:\nTITLE: Your Chosen Title\n\nDo not rewrite the essay body. Prefer titles that fit the argument, not clickbait.`;
    case "expand":
      return scope === "selection"
        ? "Expand the selected passage with one clearer beat of explanation or evidence. Return ONLY the revised passage as markdown (no preamble). Keep voice and footnote markers; do not invent sources."
        : "Find the thinnest section and expand it slightly. Return ONLY the complete revised markdown document (keep frontmatter). Preserve voice, structure, and footnotes. No preamble.";
  }
}

/** Extra system guidance layered on the essay/selection context. */
export function actionSystemAddon(action: AiActionId): string {
  switch (action) {
    case "critique":
      return "This is a critique request: answer in prose/bullets. Do not dump a full rewritten essay.";
    case "tighten":
      return "This is a tighten request: return revised markdown only when rewriting, ready to Apply.";
    case "title":
      return "This is a title request: suggest titles and end with a single TITLE: line. Do not rewrite the essay body.";
    case "expand":
      return "This is an expand request: return revised markdown only, ready to Apply.";
  }
}
