import { NextResponse } from "next/server";
import { logAudit } from "@/db/audit";
import { loadAttendance } from "@/db/ownerDashboard";
import { buildAttendanceCsv } from "@/lib/ownerDashboard";
import { requireOrgRoleApi } from "@/lib/auth/guards";

type Ctx = { params: Promise<{ id: string }> };

// The dashboard's attendance tables as CSV (brief 27, B): sessions with
// booked, present, absent and not marked, then each child's rate. Team
// members of this business only. Names and marks: nothing about a child's
// health, contacts or pickup is read for it.
export async function GET(_request: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_staff");
  if (!auth.ok) return auth.response;

  try {
    const { sessions, rates } = await loadAttendance(id);
    await logAudit({ actorUserId: auth.session.userId, organizationId: id, action: "owner_dashboard.attendance_exported", targetTable: "attendance", after: { sessions: sessions.length, children: rates.length } });
    const slug = (auth.org.slug ?? "business").replace(/[^a-z0-9-]/g, "");
    return new NextResponse(buildAttendanceCsv(sessions, rates), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-attendance.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("dashboard attendance csv", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "Could not build the CSV. Try again." }, { status: 500 });
  }
}
