import { NextResponse } from "next/server";
import { saveMarketSettings } from "@/db/marketOrders";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireAdminApi } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { parseMarketSettings } from "@/lib/market/orders";

const Body = bodyOf(["sellerPlanDollars", "commissionPercent", "feesLive"]);

// Admin -> Market -> Income (brief 25, C5): the Seller plan price, the
// commission on orders PortPass brought, and whether the daily job drafts
// real invoices (on) or only logs what it would draft (off, until Antonio
// confirms the prices). Platform owners only, after the admin second step.
export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_owner")) return NextResponse.json({ error: "Only a platform owner can change Market fees." }, { status: 403 });
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const parsed = parseMarketSettings(read.value as Record<string, unknown>);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json({ settings: await saveMarketSettings(parsed.value, auth.session.userId) });
  } catch (error) {
    console.error("market settings", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
