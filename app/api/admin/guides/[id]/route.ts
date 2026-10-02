import { NextResponse } from "next/server";
import { saveGuide, setGuideStatus } from "@/db/guides";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { cleanGuide } from "@/lib/guides";
import { bumpGuides, guideRefusal } from "@/lib/guidesServer";
import { cleanListings } from "../listings";

type Ctx = { params: Promise<{ id: string }> };

const limited = createRateLimiter(60, 10 * 60_000);

function failed(error: unknown, what: string) {
  const refusal = guideRefusal(error);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  console.error(what, error instanceof Error ? error.message : "");
  return NextResponse.json({ error: "Could not save the guide." }, { status: 500 });
}

async function guideId(ctx: Ctx): Promise<number | null> {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Admin -> Guides: save a guide and the businesses it links to.
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const id = await guideId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const cleaned = cleanGuide(body);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  try {
    await saveGuide(id, cleaned.value, cleanListings(body?.listings), auth.session.userId);
    bumpGuides();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "admin guide save");
  }
}

// Publish or unpublish. A guide is published only when it is ready: no
// [Antonio: …] notes left, a description, and at least one live business.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const id = await guideId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const status = body?.action === "publish" ? "published" : body?.action === "unpublish" ? "draft" : null;
  if (!status) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const guide = await setGuideStatus(id, status, auth.session.userId);
    bumpGuides();
    return NextResponse.json({ ok: true, status: guide.status });
  } catch (error) {
    return failed(error, "admin guide status");
  }
}
