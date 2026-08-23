/**
 * Bridge between main-doc find/replace and footnote node views.
 * Avoids importing React node views from editor helpers.
 */

import type { Editor } from "@tiptap/core";
import type { FindMatch } from "@/lib/editor/findReplace";

export type FootnoteFindSession = {
  footnoteId: string;
  /** 0-based index among matches that share this footnote. */
  occurrence: number;
  query: string;
  regex: boolean;
  caseSensitive: boolean;
};

type Listener = () => void;

let session: FootnoteFindSession | null = null;
const listeners = new Set<Listener>();

export function getFootnoteFindSession(): FootnoteFindSession | null {
  return session;
}

export function subscribeFootnoteFindSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function footnoteFindSessionsEqual(
  a: FootnoteFindSession | null,
  b: FootnoteFindSession | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.footnoteId === b.footnoteId &&
    a.occurrence === b.occurrence &&
    a.query === b.query &&
    a.regex === b.regex &&
    a.caseSensitive === b.caseSensitive
  );
}

export function setFootnoteFindSession(
  next: FootnoteFindSession | null
): void {
  if (footnoteFindSessionsEqual(session, next)) {
    return;
  }
  session = next;
  emit();
}

/** Derive the active footnote find session from main-doc match list. */
export function syncFootnoteFindSession(
  editor: Editor,
  matches: FindMatch[],
  activeIndex: number,
  options: { query: string; regex: boolean; caseSensitive: boolean }
): void {
  if (!options.query || matches.length === 0) {
    setFootnoteFindSession(null);
    return;
  }
  const match = matches[activeIndex];
  if (!match || match.footnotePos == null) {
    setFootnoteFindSession(null);
    return;
  }
  const node = editor.state.doc.nodeAt(match.footnotePos);
  if (!node || node.type.name !== "footnoteRef") {
    setFootnoteFindSession(null);
    return;
  }
  const footnoteId = String(node.attrs.id ?? "");
  if (!footnoteId) {
    setFootnoteFindSession(null);
    return;
  }

  let occurrence = 0;
  for (let i = 0; i < activeIndex; i++) {
    if (matches[i].footnotePos === match.footnotePos) {
      occurrence += 1;
    }
  }

  setFootnoteFindSession({
    footnoteId,
    occurrence,
    query: options.query,
    regex: options.regex,
    caseSensitive: options.caseSensitive,
  });
}
