import { authEnv } from "./env";

// Whether Google sign-in is switched on in Supabase Auth (Antonio turns it
// on in the Supabase dashboard). Until it is, the sign-in screens leave the
// button out: Supabase answers a provider that is off with an error page of
// its own, which a visitor should never land on. Asked of Supabase's public
// settings address (no secret involved) and remembered for five minutes.
export async function googleSignInEnabled(fetcher: typeof fetch = fetch): Promise<boolean> {
  const env = authEnv();
  if (!env) return false;
  try {
    const response = await fetcher(`${env.url}/auth/v1/settings`, { headers: { apikey: env.key }, next: { revalidate: 300 } });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: Record<string, unknown> } | null;
    return settings?.external?.google === true;
  } catch {
    return false;
  }
}
