import { NextResponse } from "next/server";
import { reviewApplication } from "@/db/applications";
import { logAudit } from "@/db/audit";
import { requireAdminApi } from "@/lib/auth/admin";

// Approve or reject an /apply submission. Platform role + two-step login,
// from the session (lib/auth/admin.ts) -- the old shared PIN is gone.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const applicationId = Number(id);
  const body = (await request.json().catch(() => ({}))) as { decision?: string };

  if (!Number.isInteger(applicationId) || !["approved", "rejected"].includes(body.decision ?? "")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await reviewApplication(applicationId, body.decision as "approved" | "rejected");
  if (!result.found) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (result.changed) {
    await logAudit({ actorUserId: auth.session.userId, action: `application.${body.decision}`, targetTable: "applications", targetId: applicationId });
  }
  return NextResponse.json({ ok: true, changed: result.changed ?? false });
}
