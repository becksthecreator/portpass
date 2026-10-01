import { NextResponse } from "next/server";
import { updateReservation, type ReservationAction } from "@/db/shop";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { orgIdParam, positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string; reservationId: string }> };

const ACTIONS = new Set<ReservationAction>(["paid", "unpaid", "refunded", "collected", "uncollected", "cancel"]);

// One tap on the seller's list (brief 15). Staff can mark paid and
// collected and cancel an unpaid reservation; recording a refund is for
// the owner or an admin of the business.
export async function PATCH(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  const reservationId = positiveInt((await ctx.params).reservationId);
  if (!id || !reservationId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = String(body?.action ?? "") as ReservationAction;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const auth = await requireOrgRoleApi(id, action === "refunded" ? "org_admin" : "org_staff");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ reservation: await updateReservation(id, reservationId, action, auth.session.userId) });
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT") {
      return NextResponse.json({ error: "Someone else just changed this reservation. Refresh to see it." }, { status: 409 });
    }
    console.error("reservation update", error);
    return NextResponse.json({ error: "Could not update the reservation." }, { status: 500 });
  }
}
