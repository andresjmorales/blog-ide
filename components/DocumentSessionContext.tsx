"use client";

import { createContext, useContext } from "react";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";

type DocumentSessionValue = {
  deletedFootnotes: DeletedFootnote[];
  restoreDeletedFootnote: (id: string) => void;
  dismissDeletedFootnote: (id: string) => void;
};

const DocumentSessionContext = createContext<DocumentSessionValue>({
  deletedFootnotes: [],
  restoreDeletedFootnote: () => {},
  dismissDeletedFootnote: () => {},
});

export function DocumentSessionProvider({
  value,
  children,
}: {
  value: DocumentSessionValue;
  children: React.ReactNode;
}) {
  return (
    <DocumentSessionContext.Provider value={value}>
      {children}
    </DocumentSessionContext.Provider>
  );
}

export function useDocumentSession() {
  return useContext(DocumentSessionContext);
}
