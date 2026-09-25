#!/usr/bin/env node
/**
 * Cross-platform replacement for scripts/build-native.sh.
 *
 * Builds the frontend bundle that ships inside the native (iOS/Android) app.
 * CAP_BUILD=1 switches the Vite build to SPA mode and skips the deploy target:
 * the output is a static bundle with no server of its own. Backend work
 * (PVGIS, geocoding, purchases) is still done by the deployed https backend
 * through server-function calls — see src/config/native-backend.ts.
 *
 * Works in Windows PowerShell, macOS and Linux (no Bash required).
 */
import { spawnSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const require = createRequire(import.meta.url);
const vitePackagePath = require.resolve("vite/package.json");
const vitePackage = JSON.parse(readFileSync(vitePackagePath, "utf8"));
const viteBin = typeof vitePackage.bin === "string" ? vitePackage.bin : vitePackage.bin?.vite;

if (typeof viteBin !== "string") {
  console.error("Could not resolve the installed Vite CLI.");
  process.exit(1);
}

const viteCli = join(dirname(vitePackagePath), viteBin);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// 1. Build the SPA bundle.
// Run the installed Vite JavaScript entry point with the current Node binary.
// This avoids Windows .cmd spawning entirely and works with npm and Bun installs.
run(process.execPath, [viteCli, "build"], {
  env: { ...process.env, CAP_BUILD: "1" },
});

// 2. Replace capacitor-www with the fresh client build.
rmSync("capacitor-www", { recursive: true, force: true });
cpSync("dist/client", "capacitor-www", { recursive: true });

// 3. Capacitor loads index.html; TanStack Start emits the SPA shell as _shell.html.
copyFileSync("capacitor-www/_shell.html", "capacitor-www/index.html");

// 4. Keep the iOS bundle's declared languages in sync with SUPPORTED_LANGUAGES.
//    (No-op when the iOS project has not been generated yet.)
run(process.execPath, ["scripts/patch-ios-localizations.mjs"]);

// 5. Camera/photo-library usage descriptions — without them iOS terminates the
//    app when the web view's "Take Photo" option opens the camera.
run(process.execPath, ["scripts/patch-ios-permissions.mjs"]);

if (!existsSync("capacitor-www/index.html")) {
  console.error("capacitor-www/index.html missing after build.");
  process.exit(1);
}

console.log("Native bundle ready in capacitor-www/");
