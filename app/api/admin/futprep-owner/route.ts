import { NextResponse } from "next/server";
import { grantFutprepOwner } from "@/db/futprepOwner";
import { bodyOf, readJson } from "@/lib/api/body";
import { requireAdminApi } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";

// Admin -> People: a founder gives owner access to Futprep on PortPass to
// the person whose staff login Futprep marked as the owner (brief 31, A4,
// after review). A staff PIN session can only ask; this is the only place
// the owner membership is written from that ask. The founder sends the
// email they saw and checked, and the grant is refused if the login's
// email has changed since. Platform owner and the admin second step;
// audit-logged by the database function (202610210002).
const Body = bodyOf(["staffId", "email"]);

const REFUSALS: Record<string, { status: number; error: string }> = {
  NOT_MARKED: { status: 409, error: "That login isn't marked as Futprep's owner any more. Refresh the page." },
  NOT_A_CEO: { status: 400, error: "Only Futprep's CEO login can be the owner." },
  EMAIL_CHANGED: { status: 409, error: "The email on that login has changed since this page loaded. Refresh, and check with the person again." },
  NO_SIGN_IN: { status: 409, error: "Nobody has signed in to PortPass with that email yet. Refresh the page." },
  ALREADY_MEMBER: { status: 409, error: "That person is already in Futprep. Change their role in the table above instead." },
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_owner")) return NextResponse.json({ error: "Only a founder can give owner access." }, { status: 403 });

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const staffId = Number(read.value.staffId);
  const email = typeof read.value.email === "string" ? read.value.email.trim().slice(0, 254) : "";
  if (!Number.isInteger(staffId) || staffId <= 0 || !email.includes("@")) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const outcome = await grantFutprepOwner({ staffId, email, founderUserId: auth.session.userId });
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const refusal = REFUSALS[message];
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("admin futprep owner grant", message);
    return NextResponse.json({ error: "That didn't finish. Refresh the page to see what was saved." }, { status: 500 });
  }
}
