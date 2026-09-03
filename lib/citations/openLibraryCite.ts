/** Toolbar Cite / mobile sheet → reveal the Library panel and focus search. */

export const OPEN_LIBRARY_CITE_EVENT = "blogide-open-library-cite";

export function requestOpenLibraryCite(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_LIBRARY_CITE_EVENT));
}
