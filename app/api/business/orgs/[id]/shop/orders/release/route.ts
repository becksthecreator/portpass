import { NextResponse } from "next/server";
import { releaseExpiredOrders } from "@/db/marketOrders";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { handlesPayments } from "@/lib/paymentRequests/access";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

const Body = bodyOf(["ids"]);

// "Release now?" on the Market orders list (brief 25, C2): the seller
// confirmed the unpaid orders past their hold that the list showed. Each
// goes back to stock, and its payment request is voided, only if it is
// still unpaid and past its hold at this moment. Nobody is messaged.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  if (!(await handlesPayments(auth))) return NextResponse.json({ error: "Only someone who handles this business's payments can release orders." }, { status: 403 });
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const ids = (Array.isArray(read.value.ids) ? read.value.ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
  if (!ids.length) return NextResponse.json({ error: "Nothing to release." }, { status: 400 });
  const actor = { userId: auth.session.userId, name: auth.session.profile?.fullName?.trim() || auth.session.email || "Team member" };
  try {
    return NextResponse.json({ released: await releaseExpiredOrders(id, ids, actor) });
  } catch (error) {
    console.error("market orders: release", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not release those orders." }, { status: 500 });
  }
}
