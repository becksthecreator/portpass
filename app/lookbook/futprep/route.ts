// @public-route: the private Futprep look book (20 Nov 2026).
//
// 1. A visit with ?k= matching FUTPREP_LOOKBOOK_KEY gets a 30-day
//    HttpOnly, SameSite=Lax cookie (a keyed hash of the key, never the
//    key) and is handed on to the clean address /lookbook/futprep, so the
//    key leaves the URL bar and the history (Security & QA, 20 Nov).
// 2. The clean address, and every asset under it, opens on that cookie
//    alone. Nothing else ever opens it: a wrong, missing or expired key or
//    cookie gets the same plain 404 as a page that doesn't exist.
//
// A route handler, not a page: it returns Site Design's HTML whole, with no
// site header, footer, menu or analytics script, so nothing on it links
// back into the site and nothing reports the visit. The book is read from a
// private Storage bucket, never this public repo or public/. Never in the
// sitemap or robots.txt (naming it there would advertise it), and nothing
// on the site links here.
import {
  FUTPREP_LOOKBOOK_KEY_ENV,
  LOOKBOOK_COOKIE,
  LOOKBOOK_COOKIE_PATH,
  LOOKBOOK_HEADERS,
  lookbookCookieMatches,
  lookbookCookieValue,
  lookbookHandoffPage,
  lookbookKeyMatches,
  lookbookSetCookie,
  readCookie,
  RIBBON_HEIGHT_PX,
  withBase,
  withDraftRibbon,
} from "@/lib/lookbook/access";
import { readLookbookPage } from "@/lib/lookbook/futprepDraft";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { ...LOOKBOOK_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const expected = process.env[FUTPREP_LOOKBOOK_KEY_ENV];

  // The key, once: swap it for the cookie and move to the clean address.
  if (url.searchParams.has("k")) {
    const cookie = lookbookCookieValue(expected);
    if (!cookie || !lookbookKeyMatches(url.searchParams.get("k"), expected)) return notFound();
    return new Response(lookbookHandoffPage(LOOKBOOK_COOKIE_PATH), {
      status: 200,
      headers: { ...LOOKBOOK_HEADERS, "Content-Type": "text/html; charset=utf-8", "Set-Cookie": lookbookSetCookie(cookie, url.protocol === "https:") },
    });
  }

  if (!lookbookCookieMatches(readCookie(request.headers.get("cookie"), LOOKBOOK_COOKIE), expected)) return notFound();
  const page = await readLookbookPage();
  if (!page) return notFound();
  // The book's floating nav (.nav, fixed 14px from the top) moves below the
  // ribbon so the ribbon never covers it.
  const navBelowRibbon = `.nav{top:calc(max(14px,env(safe-area-inset-top,0px)) + ${RIBBON_HEIGHT_PX}px)!important}`;
  return new Response(withDraftRibbon(withBase(page, `${LOOKBOOK_COOKIE_PATH}/`), undefined, navBelowRibbon), {
    status: 200,
    headers: { ...LOOKBOOK_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
