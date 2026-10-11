import { NextResponse } from "next/server";
import { alertSellerApplied } from "@/db/marketAlerts";
import { getSellerRecords, saveSellerProfile } from "@/db/marketSellers";
import { afterResponse } from "@/lib/afterResponse";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { parseSellerProfile } from "@/lib/market/sellers";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

const Body = bodyOf(["category", "whatTheySell", "contactPerson", "licenceNumber", "pickupNote", "deliveryZones", "cashOnPickup", "requestVerification"]);

const ERRORS: Record<string, string> = {
  NO_SHOP: "Set up the shop first (reference prefix and returns policy).",
  SUSPENDED: "PortPass has suspended your shop on the Market. Message us to talk it through.",
};

// The seller's Market settings (brief 25, part A): how buyers get an order,
// the records PortPass checks (business licence number, contact person),
// and asking to be verified. Owners and admins of the business.
export async function PUT(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const parsed = parseSellerProfile(read.value as Record<string, unknown>, (await getSellerRecords(id)).licenceNumber);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const { shop, joinedQueue } = await saveSellerProfile(id, parsed.value, auth.session.userId);
    if (joinedQueue) afterResponse(() => alertSellerApplied());
    return NextResponse.json({ sellerStatus: shop.sellerStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (ERRORS[message]) return NextResponse.json({ error: ERRORS[message] }, { status: 400 });
    console.error("seller settings", message);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
