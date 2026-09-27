// Edge-safe (no next/headers, no db/supabase): middleware imports this.

export function authEnv(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

// Keeps "Sign in" out of the header until sign-in has been verified end to
// end on the live site (sender, template, routing). The routes still work
// with the flag off, they're just not advertised.
export function authUiEnabled(): boolean {
  return process.env.AUTH_UI_ENABLED === "true";
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
