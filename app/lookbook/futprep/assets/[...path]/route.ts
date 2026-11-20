// @public-route: the Futprep look book's CSS, scripts and photos. Served
// only to a browser holding the cookie the look book page sets once its
// key matches (or to a link carrying the key itself); anything else is a
// plain 404. Files come from the private Supabase Storage bucket "lookbooks"
// (lib/lookbook/futprepDraft.ts), never this public repo or public/.
import { FUTPREP_LOOKBOOK_KEY_ENV, LOOKBOOK_COOKIE, LOOKBOOK_HEADERS, lookbookCookieMatches, lookbookKeyMatches, readCookie } from "@/lib/lookbook/access";
import { readLookbookAsset } from "@/lib/lookbook/futprepDraft";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { ...LOOKBOOK_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const expected = process.env[FUTPREP_LOOKBOOK_KEY_ENV];
  const allowed =
    lookbookCookieMatches(readCookie(request.headers.get("cookie"), LOOKBOOK_COOKIE), expected) ||
    lookbookKeyMatches(new URL(request.url).searchParams.get("k"), expected);
  if (!allowed) return notFound();
  const { path } = await context.params;
  const asset = await readLookbookAsset(path ?? []);
  if (!asset) return notFound();
  return new Response(new Uint8Array(asset.body), { status: 200, headers: { ...LOOKBOOK_HEADERS, "Content-Type": asset.type, "X-Content-Type-Options": "nosniff" } });
}
