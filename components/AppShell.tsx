"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  loadLocalPrefs,
  mergePrefs,
  savePrefs,
  type EditorPrefs,
} from "@/lib/settings";
import { DocumentWorkspace } from "@/components/DocumentWorkspace";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SettingsPanel } from "@/components/SettingsPanel";
import { EditorPrefsProvider } from "@/components/EditorPrefsContext";
import { DocumentSessionProvider } from "@/components/DocumentSessionContext";
import { DeletedFootnotesPanel } from "@/components/DeletedFootnotesPanel";
import type { DeletedFootnote } from "@/lib/markdown/deletedFootnotes";

const MIN_PANEL = 180;
const MAX_PANEL = 480;

const noopSubscribe = () => () => {};

/** False during SSR and the hydration render, true afterwards. */
function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

export function AppShell({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [storedPrefs, setPrefs] = useState(() =>
    mergePrefs(typeof window === "undefined" ? {} : loadLocalPrefs())
  );
  const hydrated = useHydrated();
  // Render defaults until hydration completes so server and client markup match.
  const prefs = hydrated
    ? storedPrefs
    : mergePrefs({});
  const dragging = useRef<"left" | "right" | null>(null);
  const prefsRef = useRef(storedPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deletedFootnotes, setDeletedFootnotes] = useState<DeletedFootnote[]>(
    []
  );
  const restoreRef = useRef<(id: string) => void>(() => {});
  const dismissRef = useRef<(id: string) => void>(() => {});

  useEffect(() => {
    prefsRef.current = storedPrefs;
  }, [storedPrefs]);

  const update = useCallback((patch: Partial<EditorPrefs>, persist = true) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      if (persist) savePrefs(next);
      return next;
    });
  }, []);

  const registerDeletedActions = useCallback(
    (actions: {
      restore: (id: string) => void;
      dismiss: (id: string) => void;
    }) => {
      restoreRef.current = actions.restore;
      dismissRef.current = actions.dismiss;
    },
    []
  );

  const sessionValue = useMemo(
    () => ({
      deletedFootnotes,
      restoreDeletedFootnote: (id: string) => restoreRef.current(id),
      dismissDeletedFootnote: (id: string) => dismissRef.current(id),
    }),
    [deletedFootnotes]
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current) return;
      if (dragging.current === "left") {
        const w = Math.min(MAX_PANEL, Math.max(MIN_PANEL, e.clientX));
        setPrefs((p) => ({ ...p, leftWidth: w }));
      } else {
        const w = Math.min(
          MAX_PANEL,
          Math.max(MIN_PANEL, window.innerWidth - e.clientX)
        );
        setPrefs((p) => ({ ...p, rightWidth: w }));
      }
    }
    function onUp() {
      if (dragging.current) {
        dragging.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        savePrefs(prefsRef.current);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function startDrag(side: "left" | "right") {
    dragging.current = side;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <EditorPrefsProvider prefs={prefs} updatePrefs={update}>
      <DocumentSessionProvider value={sessionValue}>
        <div className="flex flex-col h-dvh">
          <header className="flex items-center justify-between border-b border-border px-3 h-11 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => update({ leftOpen: !prefs.leftOpen })}
                title="Toggle file tree"
                className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
              >
                <PanelIcon side="left" />
              </button>
              <span className="text-sm font-semibold tracking-tight">
                BlogIDE
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="hidden sm:inline">
                Saved locally · not yet synced
              </span>
              <span className="hidden md:inline">·</span>
              <span className="hidden md:inline">{userEmail}</span>
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                aria-label="Open settings"
                className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
              >
                <SettingsIcon />
              </button>
              <button
                onClick={signOut}
                className="rounded px-2 py-1 hover:bg-panel hover:text-foreground"
              >
                Sign out
              </button>
              <button
                onClick={() => update({ rightOpen: !prefs.rightOpen })}
                title="Toggle right panel"
                className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
              >
                <PanelIcon side="right" />
              </button>
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            {prefs.leftOpen && (
              <>
                <aside
                  style={{ width: prefs.leftWidth }}
                  className="shrink-0 border-r border-border bg-panel/60 overflow-y-auto hidden md:block"
                >
                  <div className="p-3">
                    <p className="text-xs font-mono uppercase tracking-wider text-muted mb-3">
                      Files
                    </p>
                    <ul className="space-y-0.5 text-sm">
                      <li className="rounded px-2 py-1.5 bg-panel font-medium">
                        scratchpad.md
                        <span className="ml-2 text-[10px] font-mono uppercase text-muted">
                          pinned
                        </span>
                      </li>
                      <li className="px-2 py-1.5 text-muted">essays/</li>
                      <li className="px-2 py-1.5 text-muted">drafts/</li>
                    </ul>
                    <DeletedFootnotesPanel />
                    <p className="mt-6 text-xs text-muted leading-relaxed">
                      Your Supabase workspace tree arrives in milestone 3.
                      GitHub backup will be optional.
                    </p>
                  </div>
                </aside>
                <div
                  onPointerDown={() => startDrag("left")}
                  className="w-1 cursor-col-resize hover:bg-accent/40 shrink-0 hidden md:block"
                />
              </>
            )}

            <main className="flex-1 min-w-0 min-h-0">
              <DocumentWorkspace
                onDeletedFootnotesChange={setDeletedFootnotes}
                registerDeletedActions={registerDeletedActions}
              />
            </main>

            {prefs.rightOpen && (
              <>
                <div
                  onPointerDown={() => startDrag("right")}
                  className="w-1 cursor-col-resize hover:bg-accent/40 shrink-0 hidden md:block"
                />
                <aside
                  style={{ width: prefs.rightWidth }}
                  className="shrink-0 border-l border-border bg-panel/60 flex-col hidden md:flex"
                >
                  <div className="flex border-b border-border text-sm">
                    {(["ai", "preview"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => update({ rightTab: tab })}
                        className={`flex-1 px-3 py-2 capitalize ${
                          prefs.rightTab === tab
                            ? "border-b-2 border-accent font-medium"
                            : "text-muted hover:text-foreground"
                        }`}
                      >
                        {tab === "ai" ? "AI assistant" : "Preview"}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 text-sm text-muted leading-relaxed">
                    {prefs.rightTab === "ai" ? (
                      <p>
                        The AI sidebar (bring-your-own Anthropic key) arrives in
                        milestone 6. Your key never touches the server.
                      </p>
                    ) : (
                      <p>
                        The publication-style preview arrives in milestone 5 —
                        rendered through the same remark/rehype pipeline used for
                        export.
                      </p>
                    )}
                  </div>
                </aside>
              </>
            )}
          </div>

          <SettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      </DocumentSessionProvider>
    </EditorPrefsProvider>
  );
}

function PanelIcon({ side }: { side: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
      />
      <line
        x1={side === "left" ? 5.5 : 10.5}
        y1="2.5"
        x2={side === "left" ? 5.5 : 10.5}
        y2="13.5"
        stroke="currentColor"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M6.7 1.6a1.2 1.2 0 0 1 2.6 0l.08.5a4.8 4.8 0 0 1 1.1.64l.46-.24a1.2 1.2 0 0 1 1.64.44l.9 1.56a1.2 1.2 0 0 1-.44 1.64l-.46.26c.1.35.16.72.16 1.1 0 .38-.06.75-.16 1.1l.46.26a1.2 1.2 0 0 1 .44 1.64l-.9 1.56a1.2 1.2 0 0 1-1.64.44l-.46-.24a4.8 4.8 0 0 1-1.1.64l-.08.5a1.2 1.2 0 0 1-2.6 0l-.08-.5a4.8 4.8 0 0 1-1.1-.64l-.46.24a1.2 1.2 0 0 1-1.64-.44l-.9-1.56a1.2 1.2 0 0 1 .44-1.64l.46-.26A4.7 4.7 0 0 1 3.5 8c0-.38.06-.75.16-1.1l-.46-.26a1.2 1.2 0 0 1-.44-1.64l.9-1.56a1.2 1.2 0 0 1 1.64-.44l.46.24a4.8 4.8 0 0 1 1.1-.64l.08-.5ZM8 5.75A2.25 2.25 0 1 0 8 10.25 2.25 2.25 0 0 0 8 5.75Z" />
    </svg>
  );
}
