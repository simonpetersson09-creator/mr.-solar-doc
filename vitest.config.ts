import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Test-only Vite config. The app build keeps using vite.config.ts; this file
 * exists so component tests can run in jsdom (opt in per file with
 * `// @vitest-environment jsdom`) while pure logic tests stay in node.
 */
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
