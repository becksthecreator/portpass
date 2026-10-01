import { NextResponse } from "next/server";
import { draftBusinessFromApplication } from "@/db/adminBusinessActions";
import { reviewApplication } from "@/db/applications";
import { logAudit } from "@/db/audit";
import { requireAdminApi } from "@/lib/auth/admin";

// Review an /apply submission (brief 08, 1.3): "draft" turns it into a
// draft business, prefilled, ready for the setup wizard; "rejected" is
// "Not a fit". ("approved", the older one-click approval, still works.)
// Platform role + two-step login, from the session (lib/auth/admin.ts).
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const applicationId = Number(id);
  const body = (await request.json().catch(() => ({}))) as { decision?: string };

  if (!Number.isInteger(applicationId) || !["approved", "rejected", "draft"].includes(body.decision ?? "")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.decision === "draft") {
    try {
      const business = await draftBusinessFromApplication(applicationId, auth.session.userId);
      return NextResponse.json({ ok: true, changed: true, slug: business.slug });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "NOT_FOUND") return NextResponse.json({ error: "Application not found." }, { status: 404 });
      if (message === "ALREADY_REVIEWED") return NextResponse.json({ error: "This request has already been reviewed. Refresh the page." }, { status: 409 });
      if (message === "SECTION_REQUIRED") return NextResponse.json({ error: "This request has no section. Add the business from Businesses instead." }, { status: 409 });
      console.error("application draft", message);
      return NextResponse.json({ error: "Could not create the draft." }, { status: 500 });
    }
  }

  const result = await reviewApplication(applicationId, body.decision as "approved" | "rejected");
  if (!result.found) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (result.changed) {
    await logAudit({ actorUserId: auth.session.userId, action: `application.${body.decision}`, targetTable: "applications", targetId: applicationId });
  }
  return NextResponse.json({ ok: true, changed: result.changed ?? false });
}
