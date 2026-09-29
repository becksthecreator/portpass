// In-memory per-instance limiter, the same shape the public forms already
// use. Good enough to blunt code-request abuse; Supabase's own per-email
// limits sit behind it.
//
// TODO (02_AdminSignIn brief, A2 optional): this lives in memory on each
// server instance and resets whenever a new one starts. Move it to a
// small Supabase table (auth_rate_events: key, created_at) keyed on
// email + IP when the sign-in flow settles.
type Entry = { count: number; resetAt: number };

export function createRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, Entry>();
  return function limited(key: string): boolean {
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  };
}

// The same limiter, but it also says how long until the window resets, so
// the form can show a real countdown instead of "a few minutes".
export function createRateLimiterWithRetry(max: number, windowMs: number) {
  const buckets = new Map<string, Entry>();
  return function hit(key: string): { limited: boolean; retryAfter: number } {
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { limited: false, retryAfter: 0 };
    }
    entry.count += 1;
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { limited: entry.count > max, retryAfter: entry.count > max ? retryAfter : 0 };
  };
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
