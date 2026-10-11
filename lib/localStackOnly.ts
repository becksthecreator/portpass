// The integration tests and the TEST seed (scripts/seed-test-data.ts) write
// with the secret key to wherever SUPABASE_URL points, and some switch live
// Futprep rows off and on. They use the same env var names as production,
// so one terminal with the wrong environment would change live data. They
// refuse to start unless the address is a local Supabase stack, as the
// end-to-end and screenshot scripts do (audit finding 7, PR #198). The
// host is checked, not the text, so "localhost" in a path or a subdomain
// does not pass; and the address is never repeated in the error.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function assertLocalSupabase(url: string | undefined = process.env.SUPABASE_URL): void {
  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    host = "";
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error("SUPABASE_URL must point at a local Supabase stack (host 127.0.0.1 or localhost): the integration tests and the TEST seed never run against a real project.");
  }
}
