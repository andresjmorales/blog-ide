/**
 * Copy Harper's WASM binary into public/ so WorkerLinter can fetch it by URL.
 * Runs from postinstall / prebuild — the file is gitignored (~16 MiB).
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/harper.js/dist/harper_wasm_bg.wasm");
const destDir = join(root, "public/vendor/harper");
const dest = join(destDir, "harper_wasm_bg.wasm");

if (!existsSync(src)) {
  console.warn(
    "[copy-harper-wasm] harper.js wasm not found; skip (run npm install)."
  );
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-harper-wasm] wrote ${dest}`);
