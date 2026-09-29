// Edge-safe (no next/headers, no db/supabase): middleware imports this.

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
