import { NextResponse } from "next/server";
import { setPaymentPermission } from "@/db/paymentRequests";
import { orgIdFrom, paymentRouteError, paymentsApiAccess } from "@/lib/paymentRequests/access";

type Ctx = { params: Promise<{ id: string }> };

// The payments permission for one staff member: the owner (or a PortPass
// platform owner) switches it on or off. Owners and admins always have it.
export async function PUT(request: Request, ctx: Ctx) {
  const orgId = await orgIdFrom(ctx);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  if (!auth.access.canManageTeam) return NextResponse.json({ error: "Only the owner can change who handles payments." }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!/^[0-9a-f-]{36}$/.test(userId) || typeof body?.allowed !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    await setPaymentPermission(orgId, userId, body.allowed, auth.access.actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return paymentRouteError(error, "payments permission");
  }
}
