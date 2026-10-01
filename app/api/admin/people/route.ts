import { NextResponse } from "next/server";
import { ORG_ROLES, type OrgRole } from "@/db/accounts";
import { forceSignOut, removeMember, renewInvite, setMemberRole } from "@/db/adminPeople";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { escapeHtml, portpassEmailShell, portpassFrom, sendEmail } from "@/lib/email";

// Admin -> People & access (brief 08, 1.5): change a person's role in a
// business, remove their access, sign them out everywhere, or send an
// invitation again. Platform role plus the authenticator step; every
// action is audit-logged in db/adminPeople.ts and rate-limited here.
const limited = createRateLimiter(60, 10 * 60_000);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REFUSALS: Record<string, { status: number; error: string }> = {
  NOT_FOUND: { status: 404, error: "That person isn't in that business any more. Refresh the page." },
  LAST_OWNER: { status: 409, error: "That is the business's only owner. Make someone else an owner first." },
  INVALID_ROLE: { status: 400, error: "Choose a role." },
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many actions in a short time. Try again in a few minutes." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { action?: unknown; userId?: unknown; organizationId?: unknown; role?: unknown; inviteId?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const userId = typeof body?.userId === "string" && UUID.test(body.userId) ? body.userId : null;
  const organizationId = Number.isInteger(body?.organizationId) && Number(body?.organizationId) > 0 ? Number(body?.organizationId) : null;
  const actor = auth.session.userId;

  try {
    if (action === "set_role") {
      const role = ORG_ROLES.find((r) => r === body?.role) as OrgRole | undefined;
      if (!userId || !organizationId || !role) return NextResponse.json({ error: "Choose a person, a business and a role." }, { status: 400 });
      await setMemberRole(organizationId, userId, role, actor);
      return NextResponse.json({ ok: true });
    }
    if (action === "remove_member") {
      if (!userId || !organizationId) return NextResponse.json({ error: "Choose a person and a business." }, { status: 400 });
      await removeMember(organizationId, userId, actor);
      return NextResponse.json({ ok: true });
    }
    if (action === "sign_out") {
      if (!userId) return NextResponse.json({ error: "Choose a person." }, { status: 400 });
      const sessions = await forceSignOut(userId, actor);
      return NextResponse.json({ ok: true, sessions });
    }
    if (action === "resend_invite") {
      const inviteId = Number.isInteger(body?.inviteId) && Number(body?.inviteId) > 0 ? Number(body?.inviteId) : null;
      if (!inviteId) return NextResponse.json({ error: "Choose an invitation." }, { status: 400 });
      const invite = await renewInvite(inviteId, actor);
      if (!invite) return NextResponse.json({ error: "That invitation has been accepted or removed. Refresh the page." }, { status: 404 });
      const next = encodeURIComponent(`/business/${invite.organizationSlug ?? ""}`);
      const outcome = await sendEmail({
        to: invite.email,
        from: portpassFrom(),
        log: { template: "team_invite_reminder", organizationId: invite.organizationId },
        subject: `Reminder: you've been added to ${invite.organizationName} on PortPass`,
        html: portpassEmailShell(`Join ${invite.organizationName} on PortPass`, `
          <p>You were added to <strong>${escapeHtml(invite.organizationName)}</strong> on PortPass as <strong>${escapeHtml(invite.role.replace("org_", ""))}</strong>.</p>
          <p>Sign in with this email address and it's yours. There is no password: we send you a code.</p>
          <p><a href="https://portpassbahamas.com/login?next=${next}" style="color:#2463AE">Sign in to PortPass</a></p>
          <p>This invitation expires in 14 days.</p>
        `),
      });
      return NextResponse.json({ ok: true, outcome });
    }
    return NextResponse.json({ error: "Choose an action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const refusal = REFUSALS[message];
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("admin people action", action, message);
    return NextResponse.json({ error: "That didn't finish. Refresh the page to see what was saved." }, { status: 500 });
  }
}
