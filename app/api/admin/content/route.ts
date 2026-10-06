import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { saveAnnouncement, saveMotion, saveSpotlight, SITE_CONTENT_TAG } from "@/db/siteContent";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { bumpListings } from "@/lib/revalidate";
import { cleanAnnouncement, cleanMotion, cleanSpotlight } from "@/lib/siteContent";

const limited = createRateLimiter(40, 10 * 60_000);

// Admin -> Content (brief 08, 1.9): the announcement bar, the order of the
// homepage cards and (brief 22) the motion switch. Platform role plus the
// authenticator step; each save is audit-logged with before and after, and
// is live on the next request.
export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { announcement?: unknown; spotlight?: unknown; motion?: unknown } | null;
  if (!body || (body.announcement === undefined && body.spotlight === undefined && body.motion === undefined)) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  // Everything is checked before anything is written.
  const announcement = body.announcement === undefined ? null : cleanAnnouncement(body.announcement);
  if (announcement && !announcement.ok) return NextResponse.json({ error: announcement.error }, { status: 400 });
  if (body.spotlight !== undefined && !Array.isArray(body.spotlight)) return NextResponse.json({ error: "The order is a list of businesses." }, { status: 400 });
  const motion = body.motion === undefined ? null : cleanMotion(body.motion);
  if (motion && !motion.ok) return NextResponse.json({ error: motion.error }, { status: 400 });

  try {
    if (announcement?.ok) await saveAnnouncement(announcement.value, auth.session.userId);
    if (body.spotlight !== undefined) await saveSpotlight(cleanSpotlight(body.spotlight), auth.session.userId);
    if (motion?.ok) await saveMotion(motion.value.enabled, auth.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin content save", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not finish saving. Reload to see what is stored." }, { status: 500 });
  } finally {
    // Whatever was written is what the site shows next, even if a later
    // step failed. { expire: 0 }: the next request reads the new content,
    // not the old one once more.
    revalidateTag(SITE_CONTENT_TAG, { expire: 0 });
    bumpListings();
  }
}
