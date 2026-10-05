import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { retryClockSkewFetch } from "@/lib/supabaseRetryFetch";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secretKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the production environment."
    );
  }

  adminClient = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // One more go for a read refused with PGRST303; writes are never
    // repeated. See lib/supabaseRetryFetch.ts.
    global: { fetch: retryClockSkewFetch() },
  });

  return adminClient;
}

export function throwIfSupabaseError(
  error: { message?: string; details?: string; hint?: string; code?: string } | null,
  context: string,
) {
  if (!error) return;
  // Never `details`: for a failed insert or update Postgres puts the whole
  // failing row there ("Failing row contains (...)"), which on a
  // registration means names, contact details and health fields, and these
  // lines are kept in the host's logs.
  console.error(context, {
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
  const thrown = new Error(context) as Error & { code?: string };
  thrown.code = error.code;
  throw thrown;
}

// Retries once, after a short delay, for the specific failure this was
// built for: PGRST303 ("JWT issued at future" -- a clock-skew rejection at
// token-issuance time, not a real data problem) and generic network
// failures, both of which are usually gone a moment later. Anything else
// (a real query, permission, or schema error) is not retry-worthy and
// rethrows immediately -- retrying a genuine bug doesn't fix it, it just
// delays reporting it by a second.
//
// For PGRST303 this is the second line of defence. Inside a page render a
// repeated GET is answered from the render's fetch memo, so until the
// client's own fetch began retrying (lib/supabaseRetryFetch.ts) the second
// call here never reached Supabase. It still earns its place for network
// failures, and gives a refused read one further real attempt.
export async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    const isNetworkError =
      error instanceof TypeError ||
      (error instanceof Error && /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(error.message));
    if (code !== "PGRST303" && !isNetworkError) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return fn();
  }
}
