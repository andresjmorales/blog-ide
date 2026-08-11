/**
 * Copy Harper's WASM binary into public/ so WorkerLinter can fetch it by URL.
 * Runs from postinstall / prebuild — the file is gitignored (~16 MiB).
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules/harper.js/dist");
const destDir = join(root, "public/vendor/harper");
const files = ["harper_wasm_bg.wasm", "harper_wasm_slim_bg.wasm"];

mkdirSync(destDir, { recursive: true });
let copied = 0;
for (const name of files) {
  const src = join(dist, name);
  if (!existsSync(src)) {
    console.warn(`[copy-harper-wasm] missing ${src}; skip`);
    continue;
  }
  const dest = join(destDir, name);
  copyFileSync(src, dest);
  copied += 1;
  console.log(`[copy-harper-wasm] wrote ${dest}`);
}
if (copied === 0) {
  console.warn(
    "[copy-harper-wasm] harper.js wasm not found; skip (run npm install)."
  );
}
