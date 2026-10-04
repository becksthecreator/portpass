import { NextResponse } from "next/server";
import { listSections } from "@/db/categories";
import { recordEventSignup } from "@/db/leads";
import { afterResponse } from "@/lib/afterResponse";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";
import { escapeHtml, portpassEmailShell, portpassFrom, sendEmail } from "@/lib/email";
import { eventName, parseEventSignup } from "@/lib/eventSignup";
import { isSectionSlug, sectionName } from "@/lib/sections";

// @public-route: the sign-up form at an event needs no account.
//
// The 30-second sign-up form (brief 18, part C): /own and /join/<event>.
// A submission becomes a Scout lead (status New, the event, the consent
// given). The founders are told by email. NOTHING is sent to the person
// who signed up: a founder messages them by hand, one to one, as with
// every lead.

// A whole room signs up from one Wi-Fi address, so the limit per address
// is generous; the limit per WhatsApp number stops one number being
// entered over and over. (In memory, per server instance.)
const perAddress = createRateLimiter(300, 10 * 60_000);
const perNumber = createRateLimiter(4, 10 * 60_000);

async function sectionCheck(): Promise<{ known: (slug: string) => boolean; name: (slug: string) => string }> {
  try {
    const sections = await listSections();
    if (sections.length) return { known: (slug) => sections.some((s) => s.slug === slug), name: (slug) => sections.find((s) => s.slug === slug)?.name ?? slug };
  } catch {
    // fall through to the compiled list
  }
  return { known: isSectionSlug, name: (slug) => sectionName(slug) ?? slug };
}

export async function POST(request: Request) {
  if (perAddress(clientIp(request))) return NextResponse.json({ error: "Too many sign-ups from here in a short time. Wait a few minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const sections = await sectionCheck();
  const parsed = parseEventSignup(body, sections.known);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const signup = parsed.value;
  if (perNumber(signup.whatsappE164)) return NextResponse.json({ error: "We already have that number. We'll be in touch." }, { status: 429 });

  try {
    const { outcome, leadId } = await recordEventSignup(signup);
    // The founders hear about it; the person who signed up is sent nothing.
    // A business that asked not to be contacted is not reported either.
    if (outcome !== "do_not_contact" && leadId) {
      const origin = new URL(request.url).origin;
      afterResponse(() =>
        sendEmail({
          to: PORTPASS_SUPPORT_EMAIL,
          from: portpassFrom(),
          log: { template: "event_signup_received" },
          subject: `Signed up at ${eventName(signup.event)}: ${signup.businessName}`,
          html: portpassEmailShell("A business signed up", `
            <p><strong>${escapeHtml(signup.businessName)}</strong> signed up at ${escapeHtml(eventName(signup.event))}${outcome === "updated" ? " (already in Leads)" : ""}.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr><td style="padding:6px 0;color:#647069">Name</td><td style="padding:6px 0;text-align:right">${escapeHtml(signup.name)}</td></tr>
              <tr><td style="padding:6px 0;color:#647069">What they do</td><td style="padding:6px 0;text-align:right">${escapeHtml(sections.name(signup.section))}</td></tr>
              <tr><td style="padding:6px 0;color:#647069">WhatsApp OK</td><td style="padding:6px 0;text-align:right">${signup.whatsappConsent ? "Yes, they ticked the box" : "No: they did not tick the box"}</td></tr>
            </table>
            <p><a href="${origin}/admin/leads/${leadId}" style="color:#2463AE;font-weight:700">Open the lead →</a></p>
            <p style="color:#647069;font-size:12px">Nothing was sent to them. Message them yourself, one to one.</p>
          `),
        }),
      );
    }
    // The same answer whatever happened, so the form says nothing about
    // who is or isn't already known to PortPass.
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("event sign-up", error instanceof Error ? error.message : "");
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }
}
