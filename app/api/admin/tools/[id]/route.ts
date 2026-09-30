import { NextResponse } from "next/server";
import { deleteAdminLink, listAdminLinks, updateAdminLink } from "@/db/adminLinks";
import { logAudit } from "@/db/audit";
import { requireAdminApi } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { parseAdminLink } from "../parse";

type Ctx = { params: Promise<{ id: string }> };

async function owner() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth;
  if (!hasPlatformRole(auth.session, "platform_owner")) return { ok: false as const, response: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  return auth;
}

function idFrom(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await owner();
  if (!auth.ok) return auth.response;
  const id = idFrom((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const before = (await listAdminLinks()).find((l) => l.id === id);
  if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const parsed = parseAdminLink((await request.json().catch(() => null)) as Record<string, unknown> | null, { requireTitle: false });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!Object.keys(parsed.value).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const after = await updateAdminLink(id, parsed.value);
  if (!after) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await logAudit({ actorUserId: auth.session.userId, action: "admin_link.updated", targetTable: "admin_links", targetId: id, before, after });
  return NextResponse.json({ link: after });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await owner();
  if (!auth.ok) return auth.response;
  const id = idFrom((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const removed = await deleteAdminLink(id);
  if (!removed) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await logAudit({ actorUserId: auth.session.userId, action: "admin_link.deleted", targetTable: "admin_links", targetId: id, before: removed });
  return NextResponse.json({ ok: true });
}
