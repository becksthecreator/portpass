import { NextResponse } from "next/server";
import { cancelOrder, markOrderPaid, moveOrder } from "@/db/marketOrders";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { isOrderAction } from "@/lib/market/orders";
import { handlesPayments } from "@/lib/paymentRequests/access";
import { orgIdParam, positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string; orderId: string }> };

const Body = bodyOf(["action"]);

const ERRORS: Record<string, { status: number; error: string }> = {
  NOT_FOUND: { status: 404, error: "Not found." },
  CONFLICT: { status: 409, error: "Someone else just changed this order. Refresh to see it." },
  ALREADY_PAID: { status: 409, error: "This order is already marked paid." },
  CANCELLED: { status: 409, error: "This order was cancelled." },
  HAS_PAYMENTS: { status: 409, error: "A payment is recorded on this order. Refund it on its payment request before cancelling." },
};

// One tap on the seller's Market orders list (brief 25, C4): a step
// (Confirm, Preparing, Ready, Out for delivery, Delivered, Collected),
// Paid, or Cancel. Staff of the business can move an order along; marking
// it paid or cancelling it is for whoever handles the business's payments
// (brief 17's rule), since both touch its payment request. Nobody is
// messaged by any of these.
export async function PATCH(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  const orderId = positiveInt((await ctx.params).orderId);
  if (!id || !orderId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const action = read.value.action;
  if (!isOrderAction(action)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const actor = { userId: auth.session.userId, name: auth.session.profile?.fullName?.trim() || auth.session.email || "Team member" };
  try {
    if (action === "paid" || action === "cancel") {
      if (!(await handlesPayments(auth))) return NextResponse.json({ error: "Only someone who handles this business's payments can do that." }, { status: 403 });
      const order = action === "paid" ? await markOrderPaid(id, orderId, actor) : await cancelOrder(id, orderId, actor);
      return NextResponse.json({ order });
    }
    return NextResponse.json({ order: await moveOrder(id, orderId, action, auth.session.userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (ERRORS[message]) return NextResponse.json({ error: ERRORS[message].error }, { status: ERRORS[message].status });
    console.error("market order update", message);
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
  }
}
