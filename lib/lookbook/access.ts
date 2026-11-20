import { createHash, timingSafeEqual } from "node:crypto";

// Private look books (20 Nov 2026, Antonio: "a private page ... so alex can
// go through it"). A look book opens only with the secret key in its link
// (?k=...). The key lives in an env var Antonio sets in Vercel; it is never
// in the code, and the page never says whether a key was close. Fail closed:
// with no key set, or one too short to be safe, nobody gets in.

export const FUTPREP_LOOKBOOK_KEY_ENV = "FUTPREP_LOOKBOOK_KEY";

// 24 characters of a random key is far past guessing; shorter is refused so
// a placeholder like "test" can never open it on production.
export const MIN_KEY_LENGTH = 24;

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function lookbookKeyMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  const want = (expected ?? "").trim();
  if (want.length < MIN_KEY_LENGTH) return false;
  if (typeof provided !== "string" || provided.length === 0 || provided.length > 256) return false;
  // Equal-length digests, compared in constant time.
  return timingSafeEqual(digest(provided), digest(want));
}

// Every answer from a look book route carries these: out of search, out of
// caches, never framed, and the link (with its key) never sent on as a
// referrer when Alex taps a link inside the page.
export const LOOKBOOK_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

// A clear "Draft 1 · Private" ribbon at the top of whatever page the
// designers hand over, so nobody mistakes the draft for the finished book.
export function withDraftRibbon(html: string, label = "Draft 1 · Private · not for sharing"): string {
  const ribbon =
    `<div role="note" style="position:sticky;top:0;z-index:2147483647;background:#d7262e;color:#fff;font:700 13px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-align:center;padding:8px 16px">${label}</div>`;
  const body = /<body[^>]*>/i.exec(html);
  if (!body) return ribbon + html;
  const at = body.index + body[0].length;
  return html.slice(0, at) + ribbon + html.slice(at);
}
