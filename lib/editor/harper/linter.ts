"use client";

import type { Dialect, Linter } from "harper.js";
import {
  normalizeHarperDictionary,
  sameWordList,
} from "@/lib/editor/harper/dictionary";

const WASM_PATH = "/vendor/harper/harper_wasm_bg.wasm";

type Shared = {
  linter: Linter;
  dialect: Dialect;
  ready: Promise<Linter>;
};

let shared: Shared | null = null;
let desiredDictionary: string[] = [];
let dictSync: Promise<void> = Promise.resolve();

function harperWasmUrl(): string {
  // WorkerLinter boots from a blob: URL, so a root-relative path would resolve
  // against the blob origin and 404. Always pass an absolute http(s) URL.
  return new URL(WASM_PATH, window.location.origin).href;
}

async function syncDictionaryToLinter(linter: Linter): Promise<void> {
  const wanted = desiredDictionary;
  const current = await linter.exportWords();
  if (sameWordList(current, wanted)) return;
  await linter.clearWords();
  if (wanted.length > 0) {
    await linter.importWords(wanted);
  }
}

function enqueueDictionarySync(linter: Linter): Promise<void> {
  dictSync = dictSync
    .then(() => syncDictionaryToLinter(linter))
    .catch(() => {
      // Worker may still be booting or already disposed.
    });
  return dictSync;
}

/** Keep the WASM dictionary aligned with the user's saved word list. */
export function setDesiredHarperDictionary(words: string[]): void {
  desiredDictionary = normalizeHarperDictionary(words);
  if (!shared) return;
  void shared.ready.then((linter) => enqueueDictionarySync(linter));
}

/**
 * Shared WorkerLinter for the app session. Lazy-loads harper.js + WASM only
 * when writing check is turned on.
 */
export async function getHarperLinter(dialect: Dialect): Promise<Linter> {
  if (typeof window === "undefined") {
    throw new Error("Harper linter is browser-only");
  }

  if (shared) {
    const linter = await shared.ready;
    if (shared.dialect !== dialect) {
      await linter.setDialect(dialect);
      shared.dialect = dialect;
    }
    await enqueueDictionarySync(linter);
    return linter;
  }

  const ready = (async () => {
    const { WorkerLinter, createBinaryModuleFromUrl } = await import(
      "harper.js"
    );
    const binary = createBinaryModuleFromUrl(harperWasmUrl());
    const linter = new WorkerLinter({ binary, dialect });
    await linter.setup();
    await enqueueDictionarySync(linter);
    return linter;
  })();

  shared = { linter: null as unknown as Linter, dialect, ready };
  const linter = await ready;
  shared.linter = linter;
  return linter;
}

/** Test helper / teardown. */
export async function disposeHarperLinter(): Promise<void> {
  if (!shared) return;
  const current = shared;
  shared = null;
  try {
    const linter = await current.ready;
    await linter.dispose();
  } catch {
    // ignore dispose races
  }
}
