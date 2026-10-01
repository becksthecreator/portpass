import { NextResponse } from "next/server";
import { createSponsor, deleteSponsor, updateSponsor } from "@/db/sponsors";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { cleanSponsor } from "@/lib/sponsors";

const limited = createRateLimiter(60, 10 * 60_000);

type Body = { id?: unknown; sponsor?: unknown } | null;

const idOf = (body: Body): number | null => (Number.isInteger(body?.id) && Number(body?.id) > 0 ? Number(body?.id) : null);

async function gate() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth;
  if (limited(auth.session.userId)) return { ok: false as const, response: NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 }) };
  return auth;
}

function failed(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "NOT_FOUND") return NextResponse.json({ error: "That sponsor is no longer there. Refresh the page." }, { status: 404 });
  console.error("admin sponsors", message);
  return NextResponse.json({ error: "Could not finish saving. Check the list before trying again." }, { status: 500 });
}

// Admin -> Leads -> Sponsors (brief 08, 1.8). Platform role plus the
// authenticator step; every change is audit-logged in db/sponsors.ts.
export async function POST(request: Request) {
  const auth = await gate();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Body;
  const cleaned = cleanSponsor(body?.sponsor);
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, sponsor: await createSponsor(cleaned.value, auth.session.userId) }, { status: 201 });
  } catch (error) {
    return failed(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await gate();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Body;
  const id = idOf(body);
  const cleaned = cleanSponsor(body?.sponsor);
  if (!id) return NextResponse.json({ error: "Choose a sponsor." }, { status: 400 });
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, sponsor: await updateSponsor(id, cleaned.value, auth.session.userId) });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await gate();
  if (!auth.ok) return auth.response;
  const id = idOf((await request.json().catch(() => null)) as Body);
  if (!id) return NextResponse.json({ error: "Choose a sponsor." }, { status: 400 });
  try {
    await deleteSponsor(id, auth.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error);
  }
}
