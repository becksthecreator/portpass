import { vi } from "vitest";

// Every integration test imports real route handlers, which import
// db/supabase.ts, which starts with `import "server-only"` - that throws
// unconditionally outside Next's own bundler (which aliases it away at
// build time). Mocking it once here, globally, means individual
// integration test files don't each need to repeat this.
vi.mock("server-only", () => ({}));
