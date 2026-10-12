import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole, listStaffAccounts, listStaffWithoutLogin } from "@/app/futprep/staff-auth";
import { futprepOwnerStaffState, markFutprepOwner } from "@/db/futprepOwner";
import { bodyOf, readJson } from "@/lib/api/body";
import { canMarkOwner } from "@/lib/futprepRoles";

const Body = bodyOf(["id"]);

// The staff half of the owner bridge (brief 31, A4): an admin or the CEO
// marks the CEO's staff login as Futprep's owner. Marking only asks. It
// writes no membership: a founder gives the owner access in Admin ->
// People (/api/admin/futprep-owner). Moving a mark another login holds is
// the CEO login's to do. No sign-in is created and nothing is sent.
export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!canMarkOwner(role)) return NextResponse.json({ error: "Only an admin or the CEO can mark the owner." }, { status: 403 });

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const id = Number(read.value.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const outcome = await markFutprepOwner({ staffId: id, actorName: (await currentFutprepStaffName()) ?? role, actorRole: role });
    const [accounts, withoutLogin, owner] = await Promise.all([listStaffAccounts(), listStaffWithoutLogin(), futprepOwnerStaffState()]);
    return NextResponse.json({ ok: true, ...outcome, accounts, withoutLogin, ownerStates: owner ? { [owner.staffId]: owner.state } : {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_A_CEO") return NextResponse.json({ error: "Only a CEO login can be the owner." }, { status: 400 });
    if (message === "ROW_NOT_FOUND") return NextResponse.json({ error: "That login isn't active." }, { status: 404 });
    if (message === "CEO_ONLY_MOVE") return NextResponse.json({ error: "Another login is marked as the owner. Only the CEO login can move the mark." }, { status: 403 });
    console.error("Futprep owner bridge error", error);
    return NextResponse.json({ error: "Could not mark the owner." }, { status: 500 });
  }
}
