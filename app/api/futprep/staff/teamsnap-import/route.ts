import { NextResponse } from "next/server";
import { currentFutprepStaffName, currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { applyTeamsnapImport, previewTeamsnapImport } from "@/db/teamsnapImport";

// Import from TeamSnap (brief 13, part 5): { apply: false } previews,
// { apply: true } saves. Registration desk and CEO logins only. It never
// emails or messages a parent.
export async function POST(request: Request) {
  const role = await currentFutprepStaffRole();
  if (role !== "admin" && role !== "ceo") return NextResponse.json({ error: "Registration desk or CEO access required." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { programId?: unknown; termId?: unknown; csv?: unknown; apply?: unknown };
  const programId = Number(body.programId);
  const termId = Number(body.termId);
  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!Number.isInteger(programId) || !Number.isInteger(termId) || !csv.trim()) return NextResponse.json({ error: "Choose a class and paste or upload the TeamSnap CSV." }, { status: 400 });
  try {
    if (body.apply === true) {
      return NextResponse.json(await applyTeamsnapImport({ programId, termId, csv, actor: (await currentFutprepStaffName()) ?? role }));
    }
    return NextResponse.json(await previewTeamsnapImport({ programId, termId, csv }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "CSV_TOO_LARGE") return NextResponse.json({ error: "That file is too big for one class (up to 1,000 rows)." }, { status: 413 });
    if (message === "NO_CHILD_NAME_COLUMN") return NextResponse.json({ error: "Couldn't find the child's name in that file. It needs a Name column, or First Name and Last Name." }, { status: 400 });
    console.error("TeamSnap import error", error);
    return NextResponse.json({ error: "Could not read the import." }, { status: 500 });
  }
}
