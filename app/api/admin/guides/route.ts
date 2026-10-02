import { NextResponse } from "next/server";
import { saveGuide } from "@/db/guides";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { cleanGuide } from "@/lib/guides";
import { bumpGuides, guideRefusal } from "@/lib/guidesServer";
import { cleanListings } from "./listings";

const limited = createRateLimiter(40, 10 * 60_000);

// Admin -> Guides: a new guide, saved as a draft (brief 11, 3). Platform
// role plus the authenticator step; audit-logged in db/guides.ts.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const cleaned = cleanGuide(body);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  try {
    const guide = await saveGuide(null, cleaned.value, cleanListings(body?.listings), auth.session.userId);
    bumpGuides();
    return NextResponse.json({ ok: true, id: guide.id }, { status: 201 });
  } catch (error) {
    const refusal = guideRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("admin guide create", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not save the guide." }, { status: 500 });
  }
}
