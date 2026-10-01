import { NextResponse } from "next/server";
import { draftPageFromLead } from "@/db/leads";
import { requireAdminApi } from "@/lib/auth/admin";

type Ctx = { params: Promise<{ id: string }> };

// Admin -> Leads: "Draft their page". Creates an UNPUBLISHED business draft
// from the lead. It is published only after the owner agrees (Handbook §7)
// and the usual review; this route never publishes anything.
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const result = await draftPageFromLead(id, auth.session.userId);
    return NextResponse.json({ lead: result.lead, organizationId: result.organizationId, slug: result.slug }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (message === "DO_NOT_CONTACT") return NextResponse.json({ error: "This business asked not to be contacted." }, { status: 409 });
    if (message === "ALREADY_DRAFTED") return NextResponse.json({ error: "This lead already has a draft page." }, { status: 409 });
    if (message === "SECTION_REQUIRED") return NextResponse.json({ error: "Pick a section for this lead first." }, { status: 400 });
    console.error("lead draft page", message);
    return NextResponse.json({ error: "Could not create the draft page." }, { status: 500 });
  }
}
