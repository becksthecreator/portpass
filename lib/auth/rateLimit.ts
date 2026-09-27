// In-memory per-instance limiter, the same shape the public forms already
// use. Good enough to blunt code-request abuse; Supabase's own per-email
// limits sit behind it.
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

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
