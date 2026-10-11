import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole, listStaffAccounts, listStaffWithoutLogin } from "@/app/futprep/staff-auth";
import { markFutprepOwner } from "@/db/futprepOwner";
import { bodyOf, readJson } from "@/lib/api/body";
import { canMarkOwner } from "@/lib/futprepRoles";

const Body = bodyOf(["id"]);

// The owner bridge (brief 31, A4): an admin or the CEO marks the CEO's
// staff login as Futprep's owner. If that login's email belongs to a
// PortPass sign-in, the person becomes Futprep's org_owner (payments
// included) and /business/futprep opens for them. No sign-in is created
// and nothing is sent.
export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!canMarkOwner(role)) return NextResponse.json({ error: "Only an admin or the CEO can mark the owner." }, { status: 403 });

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const id = Number(read.value.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const outcome = await markFutprepOwner({ staffId: id, actorName: (await currentFutprepStaffName()) ?? role });
    const [accounts, withoutLogin] = await Promise.all([listStaffAccounts(), listStaffWithoutLogin()]);
    return NextResponse.json({ ok: true, ...outcome, accounts, withoutLogin });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_A_CEO") return NextResponse.json({ error: "Only a CEO login can be the owner." }, { status: 400 });
    if (message === "ROW_NOT_FOUND") return NextResponse.json({ error: "That login isn't active." }, { status: 404 });
    console.error("Futprep owner bridge error", error);
    return NextResponse.json({ error: "Could not mark the owner." }, { status: 500 });
  }
}
