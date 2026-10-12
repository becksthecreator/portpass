import { vi } from "vitest";
import { assertLocalSupabase } from "./lib/localStackOnly.mjs";

// Integration tests write to the database with the secret key: they run
// against a local Supabase stack only, never a real project (audit
// finding 7). This runs before every integration test file.
assertLocalSupabase();

// Every integration test imports real route handlers, which import
// db/supabase.ts, which starts with `import "server-only"` - that throws
// unconditionally outside Next's own bundler (which aliases it away at
// build time). Mocking it once here, globally, means individual
// integration test files don't each need to repeat this.
vi.mock("server-only", () => ({}));
