export type HarperIssue = {
  id: string;
  from: number;
  to: number;
  kind: string;
  message: string;
  problem: string;
  suggestions: string[];
};

export type HarperHighlightState = {
  issues: HarperIssue[];
  activeId: string | null;
};

export const EMPTY_HARPER_STATE: HarperHighlightState = {
  issues: [],
  activeId: null,
};
