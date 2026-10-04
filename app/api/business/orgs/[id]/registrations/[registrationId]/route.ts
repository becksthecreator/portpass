import { NextResponse } from "next/server";
import { REGISTRATION_STATUS_CHANGES, setBusinessRegistrationStatus } from "@/db/businessRegistrations";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";

type Ctx = { params: Promise<{ id: string; registrationId: string }> };

const limited = createRateLimiter(120, 10 * 60_000);

// Confirm, re-open or cancel one of this business's registrations
// (brief 18, D4). Team members only; logged.
export async function PATCH(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const id = Number(params.id);
  const registrationId = Number(params.registrationId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(registrationId) || registrationId <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = REGISTRATION_STATUS_CHANGES.find((s) => s === body?.status);
  if (!status) return NextResponse.json({ error: "Choose confirmed, pending or cancelled." }, { status: 400 });
  try {
    const updated = await setBusinessRegistrationStatus(id, registrationId, status, auth.session.userId);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("business registration status", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not change it." }, { status: 500 });
  }
}
