// Edge-safe (no next/headers, no db/supabase): middleware imports this.

// How long a customer's sign-in cookie lives (Brief 21, part C: customers
// 30 days). The cookie is renewed on each visit, so this is 30 days since
// the last visit; the absolute limit is Supabase Auth's time-box, set in
// its dashboard (docs/security/README.md). Platform owners' admin window
// is 12 hours (lib/auth/admin.ts) and staff PIN sessions 8 (lib/staffSession.ts).
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function authEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

// Reserved for the phone/WhatsApp code sign-in (needs Twilio + Meta sender
// approval); the screen is built to switch it on without a redesign.
export function phoneOtpEnabled(): boolean {
  return process.env.AUTH_PHONE_OTP_ENABLED === "true";
}

export function platformOwnerEmails(): string[] {
  return (process.env.PLATFORM_OWNER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

// Passkeys (Face ID / fingerprint) for returning users: Supabase's support
// is still beta (speed & sign-in brief, 29 Sept, 2.4), so the offer after a
// successful sign-in stays behind this flag until it is generally available.
export function passkeysEnabled(): boolean {
  return process.env.AUTH_PASSKEYS_ENABLED === "true";
}
