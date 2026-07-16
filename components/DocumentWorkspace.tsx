"use client";

import { useState } from "react";
import { DocumentEditor } from "@/components/DocumentEditor";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { isLossy } from "@/lib/markdown/pipeline";

const SAMPLE_DOC = `---
title: Welcome to BlogIDE
status: draft
---
# Welcome to BlogIDE

This is an in-memory document — persistence arrives in milestone 3. Try the
toolbar, keyboard shortcuts (**Ctrl+B**, *Ctrl+I*, \`Ctrl+E\`), and the
markdown source toggle in the top right.

> The editor feels like a doc; the file underneath is plain markdown.

- Everything you type round-trips through markdown
- Frontmatter (see source view) is preserved byte-for-byte
- Unknown constructs are kept as literal text, never mangled[^1]

[^1]: Footnotes are edited in place and serialize to standard GFM markdown.
`;

type Mode = "wysiwyg" | "source";

export function DocumentWorkspace() {
  // Full document = held frontmatter + editable body (spec §4.1).
  const [{ frontmatter, body }, setDoc] = useState(() => splitFrontmatter(SAMPLE_DOC));
  const [mode, setMode] = useState<Mode>("wysiwyg");
  // Source view edits the whole file, frontmatter included.
  const [sourceText, setSourceText] = useState("");
  const [lossyWarning, setLossyWarning] = useState(false);
  const [sidenotes, setSidenotes] = useState(false);

  function toSource() {
    setSourceText(frontmatter + body);
    setMode("source");
  }

  function toWysiwyg(force = false) {
    if (!force && isLossy(sourceText)) {
      setLossyWarning(true);
      return;
    }
    setLossyWarning(false);
    setDoc(splitFrontmatter(sourceText));
    setMode("wysiwyg");
  }

  const toggleButton =
    mode === "wysiwyg" ? (
      <button
        type="button"
        onClick={toSource}
        className="rounded border border-border px-2.5 py-1 text-xs font-mono text-muted hover:text-foreground hover:bg-panel"
        title="Edit raw markdown"
      >
        Markdown
      </button>
    ) : (
      <button
        type="button"
        onClick={() => toWysiwyg()}
        className="rounded border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground hover:bg-panel"
        title="Back to rich text editing"
      >
        Rich text
      </button>
    );

  if (mode === "source") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5 shrink-0">
          <span className="text-xs font-mono uppercase tracking-wider text-muted">
            Markdown source
          </span>
          {toggleButton}
        </div>

        {lossyWarning && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm"
          >
            <span>
              Re-parsing this markdown would change its formatting (unsupported
              or non-canonical constructs). Switch anyway?
            </span>
            <span className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => toWysiwyg(true)}
                className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
              >
                Switch anyway
              </button>
              <button
                type="button"
                onClick={() => setLossyWarning(false)}
                className="rounded border border-border px-2.5 py-1 text-xs hover:bg-panel"
              >
                Stay in source
              </button>
            </span>
          </div>
        )}

        <textarea
          value={sourceText}
          onChange={(e) => {
            setSourceText(e.target.value);
            setLossyWarning(false);
          }}
          spellCheck={false}
          aria-label="Markdown source"
          className="flex-1 w-full resize-none bg-transparent px-6 py-6 font-mono text-sm leading-relaxed outline-none"
        />
      </div>
    );
  }

  return (
    <DocumentEditor
      markdown={body}
      onChange={(md) => setDoc({ frontmatter, body: md })}
      sidenotes={sidenotes}
      toolbarExtra={
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSidenotes((shown) => !shown)}
            aria-pressed={sidenotes}
            className={`hidden rounded border border-border px-2.5 py-1 text-xs md:inline-block ${
              sidenotes
                ? "bg-accent/15 text-accent"
                : "text-muted hover:bg-panel hover:text-foreground"
            }`}
            title="Show footnotes in the margin"
          >
            Sidenotes
          </button>
          {toggleButton}
        </span>
      }
    />
  );
}
