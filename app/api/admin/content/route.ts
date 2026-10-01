import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { saveAnnouncement, saveSpotlight, SITE_CONTENT_TAG } from "@/db/siteContent";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { bumpListings } from "@/lib/revalidate";
import { cleanAnnouncement, cleanSpotlight } from "@/lib/siteContent";

const limited = createRateLimiter(40, 10 * 60_000);

// Admin -> Content (brief 08, 1.9): the announcement bar and the order of
// the homepage cards. Platform role plus the authenticator step; each save
// is audit-logged with before and after, and is live on the next request.
export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { announcement?: unknown; spotlight?: unknown } | null;
  if (!body || (body.announcement === undefined && body.spotlight === undefined)) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  try {
    if (body.announcement !== undefined) {
      const cleaned = cleanAnnouncement(body.announcement);
      if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      await saveAnnouncement(cleaned.value, auth.session.userId);
    }
    if (body.spotlight !== undefined) {
      if (!Array.isArray(body.spotlight)) return NextResponse.json({ error: "The order is a list of businesses." }, { status: 400 });
      await saveSpotlight(cleanSpotlight(body.spotlight), auth.session.userId);
    }
  } catch (error) {
    console.error("admin content save", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not save. Nothing was changed." }, { status: 500 });
  }
  // { expire: 0 }: the next request reads the new content, not the old one once more.
  revalidateTag(SITE_CONTENT_TAG, { expire: 0 });
  bumpListings();
  return NextResponse.json({ ok: true });
}
