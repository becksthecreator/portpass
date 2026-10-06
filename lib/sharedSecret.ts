import { createHash, timingSafeEqual } from "node:crypto";

// A shared secret in an Authorization header, as Vercel Cron and the backup
// machine send theirs: "Authorization: Bearer <secret>". Anything else in
// the header (no scheme, another scheme, two tokens) is no token at all.
// Nothing here logs or returns the secret or what was given.

export function bearerToken(request: Request): string {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : "";
}

const digest = (value: string) => createHash("sha256").update(value).digest();

// Compared as digests so the lengths always match and the comparison takes
// the same time whatever was given. Blank on either side never matches.
export function secretsMatch(given: string, secret: string): boolean {
  if (!given || !secret) return false;
  return timingSafeEqual(digest(given), digest(secret));
}
