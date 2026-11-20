// @public-route: the private Futprep look book (20 Nov 2026). Answers only
// to a link carrying the secret key (?k=...), held in FUTPREP_LOOKBOOK_KEY.
// A route handler, not a page: it returns the designed HTML whole, with no
// site header, footer, menu or analytics script, so nothing on it links
// back into the site and nothing reports the visit. Any other request,
// including a wrong or missing key, gets the same plain 404 as a page that
// doesn't exist. Never in the sitemap or robots.txt (naming it there would
// advertise it), and nothing on the site links here.
import { FUTPREP_LOOKBOOK_KEY_ENV, LOOKBOOK_HEADERS, lookbookKeyMatches, withDraftRibbon } from "@/lib/lookbook/access";
import { FUTPREP_LOOKBOOK_HTML } from "@/lib/lookbook/futprepDraft";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { ...LOOKBOOK_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request): Promise<Response> {
  const key = new URL(request.url).searchParams.get("k");
  if (!lookbookKeyMatches(key, process.env[FUTPREP_LOOKBOOK_KEY_ENV])) return notFound();
  return new Response(withDraftRibbon(FUTPREP_LOOKBOOK_HTML), {
    status: 200,
    headers: { ...LOOKBOOK_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
