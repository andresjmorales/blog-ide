"use client";

import { createContext, useContext } from "react";
import {
  DEFAULT_EDITOR_PREFS,
  type EditorPrefs,
} from "@/lib/settings";

type EditorPrefsContextValue = {
  prefs: Required<EditorPrefs>;
  updatePrefs: (patch: Partial<EditorPrefs>) => void;
};

const EditorPrefsContext = createContext<EditorPrefsContextValue>({
  prefs: DEFAULT_EDITOR_PREFS,
  updatePrefs: () => {},
});

export function EditorPrefsProvider({
  prefs,
  updatePrefs,
  children,
}: EditorPrefsContextValue & { children: React.ReactNode }) {
  return (
    <EditorPrefsContext.Provider value={{ prefs, updatePrefs }}>
      {children}
    </EditorPrefsContext.Provider>
  );
}

export function useEditorPrefs() {
  return useContext(EditorPrefsContext);
}
