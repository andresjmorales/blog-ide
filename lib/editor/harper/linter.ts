"use client";

import type { Dialect, Linter } from "harper.js";

const WASM_PATH = "/vendor/harper/harper_wasm_bg.wasm";

type Shared = {
  linter: Linter;
  dialect: Dialect;
  ready: Promise<Linter>;
};

let shared: Shared | null = null;

function harperWasmUrl(): string {
  // WorkerLinter boots from a blob: URL, so a root-relative path would resolve
  // against the blob origin and 404. Always pass an absolute http(s) URL.
  return new URL(WASM_PATH, window.location.origin).href;
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
    return linter;
  }

  const ready = (async () => {
    const { WorkerLinter, createBinaryModuleFromUrl } = await import(
      "harper.js"
    );
    const binary = createBinaryModuleFromUrl(harperWasmUrl());
    const linter = new WorkerLinter({ binary, dialect });
    await linter.setup();
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
