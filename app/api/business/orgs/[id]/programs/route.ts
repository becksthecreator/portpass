import { NextResponse } from "next/server";
import { createBusinessProgram, setBusinessProgramActive } from "@/db/businessRegistrations";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { parseProgramInput } from "@/lib/registrations/programInput";

type Ctx = { params: Promise<{ id: string }> };

const limited = createRateLimiter(30, 10 * 60_000);

async function orgId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// A business adds a class or a camp people can register for (brief 18,
// D4). Owners and admins only; the business comes from the path and the
// membership, never from the body.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parseProgramInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const created = await createBusinessProgram(id, parsed.value, auth.session.userId);
    return NextResponse.json({ ok: true, id: created.id, slug: created.slug }, { status: 201 });
  } catch (error) {
    console.error("business program create", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not add it. Check the dates and try again." }, { status: 500 });
  }
}

// Open or close a programme for registration.
export async function PATCH(request: Request, ctx: Ctx) {
  const id = await orgId(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { programId?: unknown; active?: unknown } | null;
  const programId = Number(body?.programId);
  if (!body || !Number.isInteger(programId) || programId <= 0 || typeof body.active !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await setBusinessProgramActive(id, programId, body.active, auth.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("business program change", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not change it." }, { status: 500 });
  }
}
