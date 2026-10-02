import { NextResponse } from "next/server";
import { canUsePerks, checkMemberPass, claimPassCheck, markPassCheckValid } from "@/db/memberPerks";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { checkTicket, passSecret } from "@/lib/memberPass";
import { orgIdParam } from "@/lib/shop/server";

type Ctx = { params: Promise<{ id: string }> };

// A first, in-memory brake per staff member; the count that matters is in
// the database (claimPassCheck), claimed before each check under a lock,
// so it holds across servers and against checks sent all at once.
const limited = createRateLimiter(40, 10 * 60_000);

const WAIT = "Too many checks that weren't valid. Wait ten minutes, then try again.";

// "Check a Member Pass" (brief 10, 6.3): staff type the member number and
// the six-digit code from the customer's phone. The answer is valid or not
// valid, and when valid only a first name, the member number and which of
// this business's perks apply. Never an email or a phone.
export async function POST(request: Request, ctx: Ctx) {
  const id = await orgIdParam(ctx);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;
  if (limited(`${id}:${auth.session.userId}`)) return NextResponse.json({ error: WAIT }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { memberNumber?: unknown; code?: unknown } | null;
  const memberNumber = typeof body?.memberNumber === "string" ? body.memberNumber.slice(0, 20) : "";
  const code = typeof body?.code === "string" ? body.code.slice(0, 12) : "";
  if (!memberNumber || !code) return NextResponse.json({ error: "Enter the member number and the six-digit code." }, { status: 400 });
  try {
    if (!(await canUsePerks(id))) return NextResponse.json({ error: "Passes can be checked once your page is live and you have a perk running." }, { status: 409 });
    const checkId = await claimPassCheck(id, auth.session.userId);
    if (checkId === null) return NextResponse.json({ error: WAIT }, { status: 429 });
    const result = await checkMemberPass(id, memberNumber, code);
    if (!result.valid) return NextResponse.json({ valid: false });
    await markPassCheckValid(checkId);
    return NextResponse.json({ ...result, ticket: checkTicket(passSecret(), id, result.memberNumber) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("pass check", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not check the pass. Try again." }, { status: 500 });
  }
}
