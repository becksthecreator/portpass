// @public-route: the private Futprep look book (20 Nov 2026). Answers only
// to a link carrying the secret key (?k=...), held in FUTPREP_LOOKBOOK_KEY.
// A route handler, not a page: it returns Site Design's HTML whole, with no
// site header, footer, menu or analytics script, so nothing on it links
// back into the site and nothing reports the visit. Any other request,
// including a wrong or missing key, gets the same plain 404 as a page that
// doesn't exist. Never in the sitemap or robots.txt (naming it there would
// advertise it), and nothing on the site links here.
import {
  FUTPREP_LOOKBOOK_KEY_ENV,
  LOOKBOOK_COOKIE,
  LOOKBOOK_COOKIE_MAX_AGE,
  LOOKBOOK_COOKIE_PATH,
  LOOKBOOK_HEADERS,
  lookbookCookieValue,
  lookbookKeyMatches,
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
  if (!lookbookKeyMatches(url.searchParams.get("k"), expected)) return notFound();
  const page = await readLookbookPage();
  const cookie = lookbookCookieValue(expected);
  if (!page || !cookie) return notFound();
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return new Response(withDraftRibbon(withBase(page, `${LOOKBOOK_COOKIE_PATH}/`)), {
    status: 200,
    headers: {
      ...LOOKBOOK_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      // Lets the page's own CSS, scripts and photos load; holds a keyed
      // hash of the key, never the key, and only for this path.
      "Set-Cookie": `${LOOKBOOK_COOKIE}=${cookie}; Path=${LOOKBOOK_COOKIE_PATH}; Max-Age=${LOOKBOOK_COOKIE_MAX_AGE}; HttpOnly; SameSite=Strict${secure}`,
    },
  });
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
