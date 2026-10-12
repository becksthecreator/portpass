import { NextResponse } from "next/server";
import { passportAccess } from "@/app/futprep/staff/passports/guard";
import { savePassportNote } from "@/db/passports";
import { bodyOf, readJson } from "@/lib/api/body";
import { cleanClipUrl, cleanNote, NOTE_MAX } from "@/lib/passports/rules";

// The coach's note on a passport (brief 31, D): up to 500 characters, a
// link to a clip only when the family said yes to photos and videos, and a
// suggested next class or session (one of Futprep's published offerings).
// Never health details: the screen says so, and the desk keeps those.
const Body = bodyOf(["registrationId", "note", "clipUrl", "nextStepOfferingId"]);

export async function POST(request: Request) {
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body = read.value;
  const registrationId = Number(body.registrationId);
  const note = cleanNote(body.note);
  if (!note.ok) return NextResponse.json({ error: `Keep the note to ${NOTE_MAX} characters.` }, { status: 400 });
  const clip = cleanClipUrl(body.clipUrl);
  if (!clip.ok) return NextResponse.json({ error: "A clip must be a YouTube or Google Drive link starting https://." }, { status: 400 });
  const nextStep = body.nextStepOfferingId === null || body.nextStepOfferingId === undefined || body.nextStepOfferingId === "" ? null : Number(body.nextStepOfferingId);
  if (nextStep !== null && (!Number.isInteger(nextStep) || nextStep < 1)) return NextResponse.json({ error: "Choose a next step from the list." }, { status: 400 });
  const access = await passportAccess(registrationId);
  if (!access.ok) return access.response;
  try {
    await savePassportNote({ registrationId, note: note.value, clipUrl: clip.value, nextStepOfferingId: nextStep, actor: access.account });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SHARED") return NextResponse.json({ error: "This passport has been shared with the family; it can't change now." }, { status: 409 });
    if (message === "CLIP_NOT_ALLOWED") return NextResponse.json({ error: "This family hasn't said yes to photos and videos, so a clip can't be added." }, { status: 409 });
    if (message === "BAD_NEXT_STEP") return NextResponse.json({ error: "Choose a next step from the list." }, { status: 400 });
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("passport note error", message);
    return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  }
}
