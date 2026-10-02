import { NextResponse } from "next/server";
import { approveBusiness, publishForOwner, sendBackBusiness, suspendBusiness, unsuspendBusiness } from "@/db/adminBusinessActions";
import { listOwnerEmails, type Business } from "@/db/business";
import { logMessage } from "@/db/growth";
import { businessNoticeEmail, type BusinessNotice } from "@/lib/adminEmail";
import { requireAdminApi } from "@/lib/auth/admin";
import { createRateLimiter } from "@/lib/auth/rateLimit";
import { portpassFrom, sendEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

const ACTIONS = ["approve", "publish", "send_back", "suspend", "unsuspend"] as const;
type Action = (typeof ACTIONS)[number];

// Admin actions are rate-limited per founder (brief 08, security rules).
const limited = createRateLimiter(60, 10 * 60_000);

const REFUSALS: Record<string, { status: number; error: string }> = {
  NOT_FOUND: { status: 404, error: "Not found." },
  NOT_SUBMITTED: { status: 409, error: "This business isn't waiting for review any more. Refresh the page." },
  NOT_PUBLISHABLE: { status: 409, error: "Only a draft or a submitted business can be published this way." },
  NOT_SUSPENDABLE: { status: 409, error: "Only a business that is public or waiting for review can be suspended." },
  STILL_PUBLIC: { status: 409, error: "This page is live with a change waiting. Approve the change, or suspend the page. To ask for changes, message the owner." },
  OWN_PAGES: { status: 409, error: "This business has its own pages and forms, which Suspend does not hide. It can't be suspended from here." },
  NOT_SUSPENDED: { status: 409, error: "This business isn't suspended." },
  NOTE_REQUIRED: { status: 400, error: "Say what needs to change, so the owner knows." },
  REASON_REQUIRED: { status: 400, error: "Give the reason. It is logged, and the owner is told." },
};

// The owner is told by email, and the Messages log records it. A business
// PortPass built that nobody has claimed yet has no owner to tell.
async function tellOwners(business: Business, notice: BusinessNotice, note: string | null): Promise<void> {
  const template = `business_${notice}`;
  try {
    const owners = await listOwnerEmails(business.id);
    if (owners.length === 0) {
      await logMessage({ organizationId: business.id, template, recipient: "(no owner on file)", status: "skipped", detail: "The business has no owner with a PortPass account yet." });
      return;
    }
    const email = businessNoticeEmail({ notice, businessName: business.name, slug: business.slug, note });
    for (const to of owners) {
      await sendEmail({ to, subject: email.subject, html: email.html, from: portpassFrom(), log: { template, organizationId: business.id } });
    }
  } catch (error) {
    // The action itself has happened and is in the audit log; a failed
    // notice must not undo it.
    console.error("admin business notice", error instanceof Error ? error.message : "");
  }
}

// Admin -> Businesses: approve, publish for the owner, send back with a
// note, suspend, unsuspend (brief 08, 1.2). Platform role plus the
// authenticator step; every action is audit-logged in db/adminBusinessActions.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(auth.session.userId)) return NextResponse.json({ error: "Too many actions in a short time. Try again in a few minutes." }, { status: 429 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; note?: unknown } | null;
  const action = ACTIONS.find((a) => a === body?.action) as Action | undefined;
  if (!action) return NextResponse.json({ error: "Choose an action." }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note : "";
  const actor = auth.session.userId;

  try {
    let business: Business;
    if (action === "approve") {
      business = await approveBusiness(id, actor);
      await tellOwners(business, business.status === "live" ? "live" : "approved", null);
    } else if (action === "publish") {
      business = await publishForOwner(id, actor);
      await tellOwners(business, business.status === "live" ? "live" : "approved", null);
    } else if (action === "send_back") {
      business = await sendBackBusiness(id, note, actor);
      await tellOwners(business, "sent_back", note.trim().slice(0, 1000));
    } else if (action === "suspend") {
      business = await suspendBusiness(id, note, actor);
      await tellOwners(business, "suspended", note.trim().slice(0, 1000));
    } else {
      business = await unsuspendBusiness(id, actor);
      // Say what is true: visible again, approved and waiting for a price,
      // or back with PortPass for review.
      await tellOwners(business, business.status === "live" ? "unsuspended" : business.status === "approved" ? "approved" : "in_review", null);
    }
    return NextResponse.json({ status: business.status, isPublished: business.isPublished });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INCOMPLETE") {
      const problems = (error as Error & { problems?: string[] }).problems ?? [];
      return NextResponse.json({ error: `Not ready to publish yet. ${problems.join(" ")}`.trim(), problems }, { status: 409 });
    }
    const refusal = REFUSALS[message];
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    console.error("admin business action", action, message);
    return NextResponse.json({ error: "That didn't finish. Refresh the page to see where the business stands." }, { status: 500 });
  }
}
