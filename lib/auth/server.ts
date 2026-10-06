import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { authEnv, SESSION_COOKIE_MAX_AGE_SECONDS } from "./env";

// The only Supabase client in this codebase that runs as the signed-in
// user rather than the service role, and it exists solely for Supabase
// Auth calls (send/verify a code, read the session, sign out). It uses the
// publishable key, which is still a server-only env var here: nothing in
// the browser ever talks to Supabase directly.
export async function createAuthClient() {
  const env = authEnv();
  if (!env) throw new Error("Auth is not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  const cookieStore = await cookies();
  return createServerClient(env.url, env.key, {
    cookieOptions: { maxAge: SESSION_COOKIE_MAX_AGE_SECONDS },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components can't write cookies; the middleware refresh
          // (lib/auth/middleware.ts) keeps the session alive in that case.
        }
      },
    },
  });
}
