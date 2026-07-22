/** Small fixed palette for Files explorer color dots. */
export const NODE_COLOR_PALETTE = [
  { id: "rose", label: "Rose", value: "#e11d48" },
  { id: "amber", label: "Amber", value: "#d97706" },
  { id: "lime", label: "Lime", value: "#65a30d" },
  { id: "sky", label: "Sky", value: "#0284c7" },
  { id: "violet", label: "Violet", value: "#7c3aed" },
  { id: "zinc", label: "Gray", value: "#71717a" },
] as const;

export type NodeColorValue = (typeof NODE_COLOR_PALETTE)[number]["value"];
