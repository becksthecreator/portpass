import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // scripts/loadtest is a k6 script (k6 globals like __ENV, not Node/Next);
  // public/sw.js is the service worker (ServiceWorkerGlobalScope, plain JS).
  globalIgnores([".next/**","out/**","build/**","next-env.d.ts","scripts/loadtest/**","public/sw.js"]),
]);
