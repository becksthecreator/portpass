import { NextResponse } from "next/server";
import { suspendSeller, unsuspendSeller, verifySeller } from "@/db/marketSellers";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireAdminApi } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { positiveInt } from "@/lib/shop/server";

type Ctx = { params: Promise<{ orgId: string }> };

// For "verify": the licence number and contact person the founder saw on
// the row, so what is verified is exactly what was checked.
const Body = bodyOf(["action", "reason", "licenceNumber", "contactPerson"]);

const ERRORS: Record<string, [number, string]> = {
  NOT_FOUND: [404, "Not found."],
  DEMO: [400, "The demo business can't sell on the Market."],
  BUSINESS_SUSPENDED: [400, "The business itself is suspended. Lift that first (Admin → Businesses)."],
  NEEDS_CONTACT: [400, "There's no contact person on file yet."],
  NEEDS_LICENCE: [400, "There's no business licence number on file yet."],
  NO_SHOP: [400, "This business has no shop yet."],
  RECORDS_CHANGED: [409, "The seller changed their licence number or contact person a moment ago. Reload and check again."],
  SELLER_SUSPENDED: [400, "Lift the suspension first: the seller goes back to the queue, then verify."],
  NEEDS_REASON: [400, "Say why, in a sentence: the seller sees it."],
};

// Admin -> Market -> Sellers (brief 25, A5): verify ("Made in The
// Bahamas"), suspend with a reason, or lift a suspension (back to the
// queue). Platform owners only, after the admin second step.
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_owner")) return NextResponse.json({ error: "Only a platform owner can decide on a seller." }, { status: 403 });
  const orgId = positiveInt((await ctx.params).orgId);
  if (!orgId) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const { action, reason, licenceNumber, contactPerson } = read.value;
  try {
    if (action === "verify") {
      if (typeof licenceNumber !== "string" || typeof contactPerson !== "string") return NextResponse.json({ error: "Reload the page and try again." }, { status: 400 });
      const { wentLive } = await verifySeller(orgId, auth.session.userId, { licenceNumber, contactPerson });
      return NextResponse.json({ ok: true, wentLive });
    }
    if (action === "suspend") {
      await suspendSeller(orgId, typeof reason === "string" ? reason : "", auth.session.userId);
      return NextResponse.json({ ok: true });
    }
    if (action === "unsuspend") {
      await unsuspendSeller(orgId, auth.session.userId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = ERRORS[message];
    if (known) return NextResponse.json({ error: known[1] }, { status: known[0] });
    console.error("admin seller decision", message);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
