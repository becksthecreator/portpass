import { NextRequest, NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { createApplication } from "@/db/applications";
import { createLead, noteInboundRequest } from "@/db/leads";
import { emptyLeadDraft } from "@/lib/scout/leads";
import { sendApplicationReceivedEmail } from "@/lib/email";
import { normalizePhoneE164 } from "@/lib/phone";
import { isKnownSectionSlug } from "@/db/categories";
import { getPlan } from "@/db/pricing";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 8;
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || entry.resetAt < now) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function str(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}

// "@yourbusiness", "instagram.com/yourbusiness/" and plain "yourbusiness"
// all mean the same thing; store just the username.
function instagramHandle(raw: string): string | null | false {
  if (!raw) return null;
  const handle = raw.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : false;
}

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["name", "businessName", "section", "whatsapp", "instagram", "note", "referralCode", "plan", "utm_source", "utm_medium", "utm_campaign"]);

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: Record<string, unknown> | null = read.value;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const contactPerson = str(b, "name", 120);
  const organizationName = str(b, "businessName", 150);
  const section = str(b, "section", 40);
  const whatsappRaw = str(b, "whatsapp", 40);
  const instagram = instagramHandle(str(b, "instagram", 120));
  const note = str(b, "note", 300) || null;
  // Letters, digits and dashes only, so a code can't carry anything else.
  const referralCode = str(b, "referralCode", 40).replace(/[^A-Za-z0-9-]/g, "").toUpperCase() || null;

  if (!contactPerson || !organizationName) {
    return NextResponse.json({ error: "Tell us your name and your business name." }, { status: 400 });
  }
  if (!(await isKnownSectionSlug(section))) {
    return NextResponse.json({ error: "Choose which section your business belongs in." }, { status: 400 });
  }
  const whatsappE164 = normalizePhoneE164(whatsappRaw);
  if (!whatsappE164) {
    return NextResponse.json({ error: "Enter a WhatsApp number we can message, like 423-8161 or +1 242 423 8161." }, { status: 400 });
  }
  if (instagram === false) {
    return NextResponse.json({ error: "That Instagram handle looks off — just the username, like @yourbusiness." }, { status: 400 });
  }

  const utmSource = str(b, "utm_source", 60) || null;
  const utmMedium = str(b, "utm_medium", 60) || null;
  const utmCampaign = str(b, "utm_campaign", 60) || null;
  // The plan is a hint from /pricing, not a commitment ("You can change it
  // later"), so an unknown or private code is dropped rather than refused.
  const planRaw = str(b, "plan", 40);
  const plan = planRaw ? await getPlan(planRaw).catch(() => null) : null;
  const planCode = plan && plan.isPublic ? plan.code : null;

  try {
    const { id } = await createApplication({
      organizationName,
      contactPerson,
      section,
      whatsappE164,
      instagramHandle: instagram,
      note,
      utmSource,
      utmMedium,
      utmCampaign,
      planCode,
      referralCode,
    });
    // Every request to be listed is also a lead in Admin -> Leads (brief 14,
    // "our own inbound"). A lead that can't be added (the business is
    // already there, or once asked not to be contacted) never fails the
    // request itself: the application is saved and the founders are emailed.
    try {
      const draft = emptyLeadDraft(organizationName, referralCode ? "referral" : "inbound_form");
      draft.section = section;
      draft.instagramHandle = instagram || null;
      draft.whatsappE164 = whatsappE164;
      draft.phone = whatsappE164;
      draft.referralCode = referralCode;
      draft.notes = note;
      draft.status = "replied";
      draft.nextStep = "They asked to be listed: message them on WhatsApp.";
      const made = await createLead(draft, { actorUserId: null, applicationId: id });
      // Already a lead (kept from a search, or from the tracker): it moves
      // to "Replied" and points at this request, instead of being dropped.
      if (!made.ok && made.reason === "duplicate" && made.existingId) await noteInboundRequest(made.existingId, { applicationId: id, referralCode });
    } catch (leadError) {
      console.error("Listing application: lead not created", leadError instanceof Error ? leadError.message : "");
    }
    await sendApplicationReceivedEmail({
      id,
      organizationName,
      contactPerson,
      section,
      whatsappE164,
      instagramHandle: instagram,
      note,
      utmSource,
      utmMedium,
      utmCampaign,
      planName: plan && plan.isPublic ? plan.name : null,
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    console.error("Listing application error", error);
    return NextResponse.json({ error: "We couldn’t save that. Please try again, or message us on WhatsApp." }, { status: 500 });
  }
}
