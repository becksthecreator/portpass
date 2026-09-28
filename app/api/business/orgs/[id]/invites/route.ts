import { NextResponse } from "next/server";
import { ORG_ROLES, type OrgRole } from "@/db/accounts";
import { createInvite, getBusiness, listInvites, revokeInvite } from "@/db/business";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { portpassEmailShell, portpassFrom, sendEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admins can invite staff and viewers; only an owner can hand out owner or
// admin. The invite email links to /login: signing in with that address
// accepts it (lib/auth/bootstrap.ts).
export async function POST(request: Request, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  const role = typeof body.role === "string" ? (body.role as OrgRole) : "org_staff";
  const canViewMedical = body.canViewMedical === true;
  if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!ORG_ROLES.includes(role)) return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  const callerRole = auth.membership?.role ?? null;
  if ((role === "org_owner" || role === "org_admin") && callerRole !== "org_owner" && !auth.session.platformRole) {
    return NextResponse.json({ error: "Only an owner can invite owners or admins." }, { status: 403 });
  }

  try {
    const { invite } = await createInvite(id, { email, role, canViewMedical, invitedBy: auth.session.userId });
    const business = await getBusiness(id);
    await sendEmail({
      to: email,
      from: portpassFrom(),
      subject: `You've been added to ${business?.name ?? "a business"} on PortPass`,
      html: portpassEmailShell(`Join ${business?.name ?? "the team"} on PortPass`, `
        <p>${auth.session.profile?.fullName ?? "Someone"} added you to <strong>${business?.name ?? "a business"}</strong> on PortPass as <strong>${role.replace("org_", "")}</strong>.</p>
        <p>Sign in with this email address and it's yours — no password, we'll send you a code.</p>
        <p><a href="https://portpassbahamas.com/login?next=${encodeURIComponent(`/business/${business?.slug ?? ""}`)}" style="color:#00737A">Sign in to PortPass →</a></p>
        <p>This invitation expires in 14 days.</p>
      `),
    });
    return NextResponse.json({ invite, invites: await listInvites(id) }, { status: 201 });
  } catch (error) {
    console.error("invite create", error);
    return NextResponse.json({ error: "Could not send that invite." }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_admin");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { id?: number };
  if (!Number.isInteger(body.id)) return NextResponse.json({ error: "Invalid invite." }, { status: 400 });
  await revokeInvite(id, Number(body.id), auth.session.userId);
  return NextResponse.json({ invites: await listInvites(id) });
}
