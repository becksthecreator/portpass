import { NextResponse } from "next/server";
import { reviewApplication } from "@/db/applications";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const applicationId = Number(id);
  const body = await request.json().catch(() => ({})) as { decision?: string };

  if (!Number.isInteger(applicationId) || !["approved","rejected"].includes(body.decision ?? "")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await reviewApplication(applicationId, body.decision as "approved" | "rejected");
  if (!result.found) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  return NextResponse.json({ ok: true, changed: result.changed ?? false });
}
