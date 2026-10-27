import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function applyAdMobPatch(packageRoot = resolve(root, "node_modules/@capacitor-community/admob")) {
  const patch = JSON.parse(readFileSync(resolve(root, "patches/admob-8.2.1.json"), "utf8"));
  const installed = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  if (installed.version !== patch.version) throw new Error("Unsupported AdMob version: review native safety patch before upgrading");
  // Validate every file before writing anything; unexpected upstream changes
  // must never produce a partially patched native SDK.
  const pending = patch.files.map(({ path, before, after }) => {
    const destination = resolve(packageRoot, path);
    const source = readFileSync(destination, "utf8");
    if (source !== before && source !== after) throw new Error(`Unexpected AdMob source: ${path}`);
    return { destination, after, changed: source !== after };
  });
  for (const file of pending) if (file.changed) writeFileSync(file.destination, file.after);
  return pending.filter((file) => file.changed).length;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`AdMob native safety patch applied (${applyAdMobPatch()} files changed)`);
}