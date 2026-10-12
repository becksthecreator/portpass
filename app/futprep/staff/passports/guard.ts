import "server-only";
import { NextResponse } from "next/server";
import { passportCoaches } from "@/db/passports";
import { canSeePassport, seesEveryPassport, type PassportViewer } from "@/lib/passports/access";
import { currentInboxViewer } from "../private-sessions/viewer";

// The check every passport route makes first (brief 31, D): a signed-in
// staff login that may see this child's passport. A coach only their own
// players; admins and the CEO everyone; a helper nobody. Another coach's
// child answers 403, a child who isn't Futprep's (or not on the roll) 404.
export async function passportAccess(registrationId: number): Promise<{ ok: true; account: string; viewer: PassportViewer; everyone: boolean } | { ok: false; response: NextResponse }> {
  const { account, viewer } = await currentInboxViewer();
  if (!account || !viewer.role) return { ok: false, response: NextResponse.json({ error: "Sign in again." }, { status: 401 }) };
  if (viewer.role === "helper") return { ok: false, response: NextResponse.json({ error: "Helpers don't score passports." }, { status: 403 }) };
  const everyone = seesEveryPassport(viewer.role);
  if (!everyone && viewer.coachId === null) return { ok: false, response: NextResponse.json({ error: "Your login isn't linked to a coach profile yet. Ask Alex to link it on Coach pay." }, { status: 409 }) };
  if (!Number.isInteger(registrationId) || registrationId < 1) return { ok: false, response: NextResponse.json({ error: "Invalid request." }, { status: 400 }) };
  const coaches = await passportCoaches(registrationId);
  if (!coaches) return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  if (!canSeePassport(viewer, coaches)) return { ok: false, response: NextResponse.json({ error: "Only the class's lead coach scores passports. Ask the desk." }, { status: 403 }) };
  return { ok: true, account, viewer, everyone };
}
