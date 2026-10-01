import { NextResponse } from "next/server";
import { searchCustomers } from "@/db/paymentRequests";
import { orgIdFrom, paymentRouteError, paymentsApiAccess } from "@/lib/paymentRequests/access";

type Ctx = { params: Promise<{ id: string }> };

// "Pick a customer": people this business already deals with.
export async function GET(request: Request, ctx: Ctx) {
  const orgId = await orgIdFrom(ctx);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await paymentsApiAccess(orgId);
  if (!auth.ok) return auth.response;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ customers: await searchCustomers(orgId, q) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return paymentRouteError(error, "customer search");
  }
}
