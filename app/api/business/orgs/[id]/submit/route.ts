import { NextResponse } from "next/server";
import { getBusiness, listBusinessOfferings, submissionProblems, submitBusiness } from "@/db/business";
import { requireOrgRoleApi } from "@/lib/auth/guards";
import { platformOwnerEmails } from "@/lib/auth/env";
import { PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";
import { sendBusinessSubmittedEmail } from "@/lib/email";
import { sectionName } from "@/lib/sections";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_viewer");
  if (!auth.ok) return auth.response;
  const business = await getBusiness(id);
  if (!business) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ problems: submissionProblems(business, await listBusinessOfferings(id)) });
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const auth = await requireOrgRoleApi(id, "org_owner");
  if (!auth.ok) return auth.response;

  try {
    const business = await submitBusiness(id, auth.session.userId);
    const recipients = Array.from(new Set([...platformOwnerEmails(), PORTPASS_SUPPORT_EMAIL]));
    await sendBusinessSubmittedEmail({
      to: recipients,
      businessName: business.name,
      section: sectionName(business.primaryCategory),
      submittedBy: auth.session.profile?.fullName ?? auth.session.email ?? "the owner",
      previewUrl: `https://portpassbahamas.com/business/${business.slug}/preview`,
    });
    return NextResponse.json({ business });
  } catch (error) {
    const problems = (error as Error & { problems?: string[] }).problems;
    if (problems) return NextResponse.json({ error: "A few things are missing before we can review it.", problems }, { status: 400 });
    console.error("business submit", error);
    return NextResponse.json({ error: "Could not submit. Please try again." }, { status: 500 });
  }
}
