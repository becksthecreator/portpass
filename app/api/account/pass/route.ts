import { NextResponse } from "next/server";
import { getMemberCard } from "@/db/memberPerks";
import { requireSignedInApi } from "@/lib/auth/guards";
import { passSecret, upcomingPassCodes } from "@/lib/memberPass";

// The Member Pass (brief 10, 6.2): the signed-in member's first name,
// member number and the codes for the next ten minutes. The secret that
// makes the codes stays here; the page is handed ready-made codes, and
// keeps them so the pass still works with no signal. Nothing else about
// the member is in the answer.
export async function GET() {
  const auth = await requireSignedInApi();
  if (!auth.ok) return auth.response;
  const card = await getMemberCard(auth.session.userId);
  const secret = passSecret();
  if (!card || !secret) return NextResponse.json({ error: "Your Member Pass isn't ready yet. Try again in a moment." }, { status: 503 });
  const now = Date.now();
  return NextResponse.json(
    { firstName: card.firstName, memberNumber: card.memberNumber, memberSince: card.memberSince, now, codes: upcomingPassCodes(secret, card.memberNumber, now) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
