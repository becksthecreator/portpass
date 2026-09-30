import { NextResponse } from "next/server";
import { currentFutprepStaffRole } from "@/app/futprep/staff-auth";
import { rosterExportForTerm } from "@/db/staff";
import { buildRosterCsv } from "@/lib/rosterCsv";
import { slugify } from "@/lib/slug";

// GET /api/futprep/staff/roster-csv?program=<id>&term=<id>: the roster of
// one program-in-a-term as a spreadsheet (brief 06 v2, A1.7). No medical,
// allergy or emergency fields, ever -- see lib/rosterCsv.ts. Staff only;
// the read-only helper role cannot export.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const role = await currentFutprepStaffRole();
  if (!role || role === "helper") return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const url = new URL(request.url);
  const programId = Number(url.searchParams.get("program"));
  const termId = Number(url.searchParams.get("term"));
  if (!Number.isInteger(programId) || programId < 1 || !Number.isInteger(termId) || termId < 1) {
    return NextResponse.json({ error: "Choose a program and term." }, { status: 400 });
  }

  try {
    const roster = await rosterExportForTerm(programId, termId);
    if (!roster) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const filename = `${slugify(`${roster.programName} ${roster.termName}`) || "roster"}-roster.csv`;
    return new NextResponse(buildRosterCsv(roster.rows, roster.days), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Futprep roster export error", error);
    return NextResponse.json({ error: "Could not build the roster." }, { status: 500 });
  }
}
