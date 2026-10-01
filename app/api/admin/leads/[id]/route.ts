import { NextResponse } from "next/server";
import { listSections } from "@/db/categories";
import { removeInboundLead, updateLead } from "@/db/leads";
import { requireAdminApi } from "@/lib/auth/admin";
import { parseLeadPatch } from "@/lib/scout/input";

type Ctx = { params: Promise<{ id: string }> };

// Admin -> Leads: edit a lead or move its status. "Do not contact" is
// permanent: it wipes the contact details and the lead can't be reopened.
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const sections = await listSections({ includeHidden: true });
  const parsed = parseLeadPatch(await request.json().catch(() => null), sections);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const lead = await updateLead(id, parsed.patch, auth.session.userId);
    return NextResponse.json({ lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (message === "DO_NOT_CONTACT") return NextResponse.json({ error: "This business asked not to be contacted. The lead is closed for good." }, { status: 409 });
    if (message === "DUPLICATE") return NextResponse.json({ error: "Another lead already has that Instagram handle." }, { status: 409 });
    console.error("lead update", message);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}

// Removes a junk or mistaken request that came in through the public get
// listed form and that nobody has worked on. Nothing a founder added,
// kept, imported or drafted a page for can be removed here; those are
// closed with "Not now" or "Do not contact".
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    await removeInboundLead(id, auth.session.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (message === "NOT_REMOVABLE") return NextResponse.json({ error: "Only a request from the get listed form that nobody has worked on can be removed." }, { status: 409 });
    console.error("lead remove", message);
    return NextResponse.json({ error: "Could not remove that." }, { status: 500 });
  }
}
