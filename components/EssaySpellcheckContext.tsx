"use client";

import { createContext, useContext } from "react";

export type EssaySpellcheckValue = {
  /** Effective spellcheck (global ⊕ per-essay override). */
  enabled: boolean;
  /** Ordered BCP-47 tags; index 0 is primary (browser `lang`). */
  languages: string[];
  /** Primary language tag applied to contenteditable. */
  lang: string;
};

const EssaySpellcheckContext = createContext<EssaySpellcheckValue>({
  enabled: false,
  languages: ["en-US"],
  lang: "en-US",
});

export function EssaySpellcheckProvider({
  value,
  children,
}: {
  value: EssaySpellcheckValue;
  children: React.ReactNode;
}) {
  return (
    <EssaySpellcheckContext.Provider value={value}>
      {children}
    </EssaySpellcheckContext.Provider>
  );
}

export function useEssaySpellcheck() {
  return useContext(EssaySpellcheckContext);
}
