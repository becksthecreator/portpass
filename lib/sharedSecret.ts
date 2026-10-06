import { createHash, timingSafeEqual } from "node:crypto";

// A shared secret in an Authorization header, as Vercel Cron and the backup
// machine send theirs: "Authorization: Bearer <secret>". Nothing here logs
// or returns the secret or what was given.

export function bearerToken(request: Request): string {
  return (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

const digest = (value: string) => createHash("sha256").update(value).digest();

// Compared as digests so the lengths always match and the comparison takes
// the same time whatever was given. Blank on either side never matches.
export function secretsMatch(given: string, secret: string): boolean {
  if (!given || !secret) return false;
  return timingSafeEqual(digest(given), digest(secret));
}
