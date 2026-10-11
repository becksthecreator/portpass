import { NextResponse } from "next/server";
import { grantFutprepOwner } from "@/db/futprepOwner";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireAdminApi } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";

// Admin -> People: a founder gives owner access to Futprep on PortPass to
// the person whose staff login Futprep marked as the owner (brief 31, A4,
// after review). A staff PIN session can only ask; this is the only place
// the owner membership is written from that ask. Platform owner and the
// admin second step; audit-logged in db/futprepOwner.ts.
const Body = bodyOf(["staffId"]);

const REFUSALS: Record<string, { status: number; error: string }> = {
  NOT_MARKED: { status: 409, error: "That login isn't marked as Futprep's owner any more. Refresh the page." },
  NOT_A_CEO: { status: 400, error: "Only Futprep's CEO login can be the owner." },
  ALREADY_MEMBER: { status: 409, error: "That person is already in Futprep. Change their role in the table above instead." },
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_owner")) return NextResponse.json({ error: "Only a founder can give owner access." }, { status: 403 });

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const staffId = Number(read.value.staffId);
  if (!Number.isInteger(staffId) || staffId <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const outcome = await grantFutprepOwner({ staffId, founderUserId: auth.session.userId });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const refusal = REFUSALS[message];
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("admin futprep owner grant", message);
    return NextResponse.json({ error: "That didn't finish. Refresh the page to see what was saved." }, { status: 500 });
  }
}
