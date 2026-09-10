import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts (unit tests, no I/O) so integration tests -
// which need SUPABASE_URL/SUPABASE_SECRET_KEY pointed at a real Postgres
// instance (a local Supabase stack in CI, per .github/workflows/ci.yml) -
// never accidentally run as part of the fast `npm run test` step, and vice
// versa: `npm run test:integration` won't fail confusingly just because no
// database is configured for a plain unit-test run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    testTimeout: 15000,
    setupFiles: ["./vitest.integration.setup.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
