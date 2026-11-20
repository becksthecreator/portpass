import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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
// It sits in the page's flow (32px tall); `css` lets a page move its own
// fixed header below it (the Futprep book's floating nav is `.nav`).
export const RIBBON_HEIGHT_PX = 32;
export function withDraftRibbon(html: string, label = "Draft 1 · Private · not for sharing", css = ""): string {
  const ribbon =
    (css ? `<style>${css}</style>` : "") +
    `<div role="note" style="position:relative;z-index:2147483647;box-sizing:border-box;height:${RIBBON_HEIGHT_PX}px;background:#d7262e;color:#fff;font:700 13px/16px system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-align:center;padding:8px 16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>`;
  const body = /<body[^>]*>/i.exec(html);
  if (!body) return ribbon + html;
  const at = body.index + body[0].length;
  return html.slice(0, at) + ribbon + html.slice(at);
}

// After the key opens the page, its CSS, scripts and photos load from
// /lookbook/futprep/assets/... without the key in their links: the page
// sets a short-lived cookie that holds a keyed hash of the key, never the
// key, scoped to the look book's own path. Changing the env var turns
// every such cookie off at once.
export const LOOKBOOK_COOKIE = "pp_lookbook_futprep";
export const LOOKBOOK_COOKIE_PATH = "/lookbook/futprep";
export const LOOKBOOK_COOKIE_MAX_AGE = 12 * 60 * 60;

export function lookbookCookieValue(expected: string | null | undefined): string | null {
  const want = (expected ?? "").trim();
  if (want.length < MIN_KEY_LENGTH) return null;
  return createHmac("sha256", want).update("futprep-lookbook-assets-v1").digest("hex");
}

export function lookbookCookieMatches(provided: string | null | undefined, expected: string | null | undefined): boolean {
  const want = lookbookCookieValue(expected);
  if (!want || typeof provided !== "string" || provided.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(want));
}

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// The page's relative links ("assets/book.css") resolve from the look
// book's own folder, whether or not the address ends in a slash.
export function withBase(html: string, href: string): string {
  const tag = `<base href="${href}">`;
  const head = /<head[^>]*>/i.exec(html);
  if (!head) return tag + html;
  const at = head.index + head[0].length;
  return html.slice(0, at) + tag + html.slice(at);
}
