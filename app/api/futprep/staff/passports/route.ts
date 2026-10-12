import { NextResponse } from "next/server";
import { passportAccess } from "@/app/futprep/staff/passports/guard";
import { getStaffPassport, passportWindows, savePassportMark } from "@/db/passports";
import { bodyOf, readJson } from "@/lib/api/body";
import { validScore } from "@/lib/passports/rules";

// The Progress Passport on the roster (brief 31, D). GET opens a child's
// passport (made on first open); POST saves one tap: one skill's start or
// end mark. A coach scores only their own players, start marks in week 1
// and end marks in the last two weeks; the desk and the CEO any child, any
// time, to put a mark right. A shared passport is final.
const MarkBody = bodyOf(["registrationId", "skillId", "phase", "score"]);

export async function GET(request: Request) {
  const registrationId = Number(new URL(request.url).searchParams.get("registrationId"));
  const access = await passportAccess(registrationId);
  if (!access.ok) return access.response;
  try {
    const passport = await getStaffPassport(registrationId, access.account);
    if (!passport) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ passport, canOverride: access.everyone });
  } catch (error) {
    console.error("passport load error", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not open the passport." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const read = await readJson(request, MarkBody);
  if (!read.ok) return read.response;
  const body = read.value;
  const registrationId = Number(body.registrationId);
  const skillId = Number(body.skillId);
  const phase = body.phase === "start" || body.phase === "end" ? body.phase : null;
  if (!phase || !Number.isInteger(skillId) || skillId < 1 || !validScore(body.score)) return NextResponse.json({ error: "Choose a mark from 1 to 5." }, { status: 400 });
  const access = await passportAccess(registrationId);
  if (!access.ok) return access.response;
  if (!access.everyone) {
    const windows = await passportWindows(registrationId);
    if (!windows || !windows[phase]) return NextResponse.json({ error: phase === "start" ? "Start marks are given in the first week of term." : "End marks are given in the last two weeks of term." }, { status: 409 });
  }
  try {
    await savePassportMark({ registrationId, skillId, phase, score: body.score as number, actor: access.account });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SHARED") return NextResponse.json({ error: "This passport has been shared with the family; it can't change now." }, { status: 409 });
    if (message === "BAD_SKILL") return NextResponse.json({ error: "That skill isn't on this passport." }, { status: 400 });
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("passport mark error", message);
    return NextResponse.json({ error: "Could not save the mark." }, { status: 500 });
  }
}
