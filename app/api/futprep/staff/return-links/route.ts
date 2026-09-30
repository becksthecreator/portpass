import { NextResponse } from "next/server";
import { currentFutprepStaffAccount, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { createReturnLink, listFutprepOffers } from "@/db/registrations";

// "Copy return link" on the registration desk (brief 06 v2, Part C): one
// early-access link for one family, sent by staff on WhatsApp by hand --
// never in bulk. Only while a term is taking early-access registrations.
export async function POST(request: Request) {
  const [account, role] = await Promise.all([currentFutprepStaffAccount(), currentFutprepStaffRole()]);
  if (!account || (role !== "admin" && role !== "ceo")) return NextResponse.json({ error: "Registration admin access required." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { registrationId?: unknown };
  const registrationId = Number(body.registrationId);
  if (!Number.isInteger(registrationId) || registrationId < 1) return NextResponse.json({ error: "Invalid registration." }, { status: 400 });

  try {
    const earlyTerms = (await listFutprepOffers({ earlyAccess: true })).filter((offer) => offer.earlyAccessOnly);
    if (earlyTerms.length === 0) {
      return NextResponse.json({ error: "No term is open for early access yet. Switch Term 2 on (with its early-access date) first." }, { status: 409 });
    }
    const { token } = await createReturnLink(registrationId, account);
    const url = `${new URL(request.url).origin}/futprep/register/return/${token}`;
    return NextResponse.json({ url, termNames: Array.from(new Set(earlyTerms.map((t) => t.termName))) }, { status: 201 });
  } catch (error) {
    console.error("return link error", error);
    return NextResponse.json({ error: "Could not create the link." }, { status: 500 });
  }
}
