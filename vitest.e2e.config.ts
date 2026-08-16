import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vitest.config.ts (which explicitly excludes e2e/**) because
// these tests need a running app server (`pnpm dev` or `pnpm build && pnpm
// start`) and real Postgres — they're not part of the fast `pnpm test` unit
// suite. Run with `pnpm test:e2e` once the server is up. See README.
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["e2e/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
