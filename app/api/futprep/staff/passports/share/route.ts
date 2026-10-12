import { NextResponse } from "next/server";
import { passportAccess } from "@/app/futprep/staff/passports/guard";
import { sharePassport } from "@/db/passports";
import { bodyOf, readJson } from "@/lib/api/body";

// Share a passport with the family (brief 31, D): once every skill has an
// end mark. The child's coach or the desk; for good. The family then sees
// it when they look up their registration on /futprep/my. Nothing is sent.
const Body = bodyOf(["registrationId"]);

export async function POST(request: Request) {
  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const registrationId = Number(read.value.registrationId);
  const access = await passportAccess(registrationId);
  if (!access.ok) return access.response;
  try {
    await sharePassport({ registrationId, actor: access.account });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_READY") return NextResponse.json({ error: "Give every skill an end mark first." }, { status: 409 });
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    console.error("passport share error", message);
    return NextResponse.json({ error: "Could not share the passport." }, { status: 500 });
  }
}
