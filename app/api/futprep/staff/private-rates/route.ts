import { NextResponse } from "next/server";
import { currentFutprepStaffId, currentFutprepStaffName, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { coachForStaffMember, setPrivatePayRates } from "@/db/coachPay";
import { bodyOf, readJson } from "@/lib/api/body";
import { roleCan } from "@/lib/futprepRoles";
import { dollarsToCents } from "@/lib/registrations/programInput";

// What Futprep pays a coach for a 30- and a 60-minute private session
// (brief 31, C5): the CEO or an admin, on the operating map. Futprep types
// the amounts; nothing in code sets a rate. Audit-logged. An admin who
// also coaches doesn't set their own: the CEO does (security review).
const Body = bodyOf(["coachId", "private30", "private60"]);

function amount(value: unknown): number | null | "bad" {
  if (value === null || value === undefined || value === "") return null;
  const cents = dollarsToCents(value);
  return cents === null ? "bad" : cents;
}

export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!roleCan(role, "private_pay_rates")) return NextResponse.json({ error: "Only an admin or the CEO can set private session pay." }, { status: 403 });
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const coachId = Number(read.value.coachId);
  const private30 = amount(read.value.private30);
  const private60 = amount(read.value.private60);
  if (!Number.isInteger(coachId) || coachId < 1 || private30 === "bad" || private60 === "bad") return NextResponse.json({ error: "Enter each amount in dollars, or leave it blank." }, { status: 400 });
  if (role !== "ceo") {
    const staffId = await currentFutprepStaffId();
    const own = staffId ? await coachForStaffMember(staffId).catch(() => null) : null;
    if (own && own.id === coachId) return NextResponse.json({ error: "Your own private session pay is set by the CEO." }, { status: 403 });
  }
  try {
    const coach = await setPrivatePayRates({ coachId, private30Cents: private30, private60Cents: private60, actor: (await currentFutprepStaffName()) ?? role });
    return NextResponse.json({ ok: true, coach: { id: coach.id, private30PayCents: coach.private30PayCents, private60PayCents: coach.private60PayCents } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "COACH_NOT_FOUND") return NextResponse.json({ error: "Coach not found." }, { status: 404 });
    if (message === "INVALID_RATE") return NextResponse.json({ error: "Enter each amount in dollars, or leave it blank." }, { status: 400 });
    console.error("private rates error", error);
    return NextResponse.json({ error: "Could not save the rates." }, { status: 500 });
  }
}
