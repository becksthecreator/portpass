// What to tell someone when a sign-in code could not be sent (02 brief,
// A2). Three limits look alike from the outside but mean very different
// waits: Supabase's built-in mailer allows two emails an hour for the
// whole project, while the app's own per-email and per-IP limits reset in
// minutes. Each gets its own words and a retryAfter the form can count
// down. Pure, so it is unit-tested without Supabase.
export type SendFailure = { status: number; error: string; code: string; retryAfter?: number };

export const SUPABASE_EMAIL_LIMIT_SECONDS = 3600;

export function supabaseSendFailure(error: { code?: string | null; status?: number | null; message?: string | null }, mode: "login" | "signup"): SendFailure {
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    return { status: 429, code: "email_provider_limit", error: "Our email sender is at its hourly limit. Try again in up to an hour.", retryAfter: SUPABASE_EMAIL_LIMIT_SECONDS };
  }
  if (/rate limit|too many/i.test(message)) {
    return { status: 429, code: "rate_limited", error: "Too many codes requested. Try again in a few minutes.", retryAfter: 300 };
  }
  // shouldCreateUser: false on /login -- Supabase refuses to send a code
  // to an address with no account. The login screen says so and points at
  // sign-up (the brief's decision: no stray accounts from a typo here).
  if (mode === "login" && (code === "otp_disabled" || /signups? not allowed/i.test(message))) {
    return { status: 404, code: "no_account", error: "There's no PortPass account with that email yet." };
  }
  return { status: 502, code: "send_failed", error: "We couldn’t send a code right now. Try again in a minute." };
}

export function appLimitFailure(kind: "ip" | "email", retryAfter: number): SendFailure {
  return kind === "ip"
    ? { status: 429, code: "ip_limited", error: "Too many attempts. Try again in a few minutes.", retryAfter }
    : { status: 429, code: "email_limited", error: "Too many codes requested for this email. Try again in a few minutes.", retryAfter };
}

// "12:40" for the countdown; under a minute, just the seconds.
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}
