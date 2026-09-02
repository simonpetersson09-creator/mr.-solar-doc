// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The native (Capacitor) bundle is built with CAP_BUILD=1. That build runs in
// SPA mode so the whole frontend can ship inside the iOS app bundle; the web
// build is untouched and keeps SSR.
const nativeBuild = process.env["CAP_BUILD"] === "1";

export default defineConfig({
  // The native bundle is static; no deploy target is built for it.
  ...(nativeBuild ? { nitro: false as const } : {}),
  tanstackStart: nativeBuild
    ? // The native bundle has no server of its own, so the SSR error wrapper is
      // not used; the prerenderer requires the default server entry.
      { spa: { enabled: true } }
    : {
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        // nitro/vite builds from this
        server: { entry: "server" },
      },
});
