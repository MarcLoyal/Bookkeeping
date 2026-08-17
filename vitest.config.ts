import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e/**"],
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next.js aliases this to a no-op for server bundles at the webpack
      // level; outside Next's build (here, under Vitest) it throws
      // unconditionally, so mirror that aliasing for tests that import
      // lib/data/*.ts (each starts with `import "server-only"`).
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
});
