import { NextResponse } from "next/server";
import { createAdminLink } from "@/db/adminLinks";
import { logAudit } from "@/db/audit";
import { requireAdminApi } from "@/lib/auth/admin";
import { hasPlatformRole } from "@/lib/auth/guards";
import { parseAdminLink } from "./parse";

// Admin -> Our tools: add a link. Platform owners only (29 Sept brief, part 3).
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (!hasPlatformRole(auth.session, "platform_owner")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const parsed = parseAdminLink((await request.json().catch(() => null)) as Record<string, unknown> | null, { requireTitle: true });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const link = await createAdminLink({ title: parsed.value.title ?? "", url: parsed.value.url ?? null, description: parsed.value.description ?? null, sort: parsed.value.sort ?? 0 });
  await logAudit({ actorUserId: auth.session.userId, action: "admin_link.created", targetTable: "admin_links", targetId: link.id, after: link });
  return NextResponse.json({ link }, { status: 201 });
}
