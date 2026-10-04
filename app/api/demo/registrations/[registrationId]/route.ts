import { NextResponse } from "next/server";
import { REGISTRATION_STATUS_CHANGES, setBusinessRegistrationStatus } from "@/db/businessRegistrations";
import { requireDemoApi } from "@/lib/auth/demo";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";

type Ctx = { params: Promise<{ registrationId: string }> };

const limited = createRateLimiter(120, 10 * 60_000);

// Confirm, re-open or cancel one of the demo's registrations (brief 18,
// part B). The business is the demo, from the demo session: there is no
// business id in the address to change.
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireDemoApi();
  if (!auth.ok) return auth.response;
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many changes in a row. Wait a few minutes." }, { status: 429 });
  const registrationId = Number((await ctx.params).registrationId);
  if (!Number.isInteger(registrationId) || registrationId <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = REGISTRATION_STATUS_CHANGES.find((s) => s === body?.status);
  if (!status) return NextResponse.json({ error: "Choose confirmed, pending or cancelled." }, { status: 400 });
  try {
    const updated = await setBusinessRegistrationStatus(auth.org.id, registrationId, status, null);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("demo registration status", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not change it." }, { status: 500 });
  }
}
