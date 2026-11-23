import { NextRequest, NextResponse } from "next/server";
import { bodyOf, readJson } from "@/lib/api/body";
import { completeStartedWeddingLead, createWeddingLead, hadRecentSubmittedWeddingLead } from "@/db/weddingLeads";
import { getWeddingPackageBySlug } from "@/db/weddingPackages";
import { escapeHtml, sendEmail } from "@/lib/email";
import { weddingAutoReply } from "@/lib/weddingAutoReply";

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

const CONSULTATION_METHODS = ["phone", "whatsapp_video", "guided_text"];

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strArray(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim().slice(0, max)).filter(Boolean).slice(0, 20)
    : [];
}

function utmRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && key.length <= 40) out[key.slice(0, 40)] = raw.trim().slice(0, 200);
  }
  return out;
}

// The fields this route reads, and no others (lib/api/body.ts).
const Body = bodyOf(["idempotencyKey", "names", "email", "phone", "ceremonyType", "packageSlug", "preferredWeddingDate", "guestCount", "arrivalDate", "locationIdea", "venuePreference", "venueId", "requestedServices", "consultationMethod", "consultationPreferredDate", "consultationPreferredTime", "consultationTimeZone", "travelOrigin", "notes", "contactConsent", "marketingConsent", "utm", "stage"]);

// A light shape check only: the Wedding Desk replies by hand, so a typo is
// caught there. It stops "started" rows that could never be answered.
function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const read = await readJson(request, Body);
  if (!read.ok) return read.response;
  const body: Record<string, unknown> | null = read.value;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const idempotencyKey = str(b.idempotencyKey, 200);
  const names = str(b.names, 120);
  const contactConsent = b.contactConsent === true;

  if (!idempotencyKey) return NextResponse.json({ error: "Missing idempotency key." }, { status: 400 });
  if (!names) return NextResponse.json({ error: "Tell us your names." }, { status: 400 });
  if (!contactConsent) return NextResponse.json({ error: "Please confirm we can contact you about this enquiry." }, { status: 400 });

  // "started": the planner's second step, names and email only, so a couple
  // who stops partway still reaches the Wedding Desk. Anything else is the
  // full plan, which fills in that same row when it exists.
  const stage = b.stage === "started" ? "started" : "submitted";
  const email = str(b.email, 254);
  if (email && !looksLikeEmail(email)) return NextResponse.json({ error: "Check your email address." }, { status: 400 });
  if (stage === "started") {
    if (!email) return NextResponse.json({ error: "Add your email so we can reply." }, { status: 400 });
    try {
      const lead = await createWeddingLead({
        idempotencyKey,
        names,
        email,
        phone: str(b.phone, 60),
        ceremonyType: str(b.ceremonyType, 80),
        notes: "Started the online planner and hasn't sent the full plan yet.",
        contactConsent,
        marketingConsent: b.marketingConsent === true,
        utm: { ...utmRecord(b.utm), planner_stage: "started" },
      });
      return NextResponse.json({ id: lead.id, publicToken: lead.publicToken });
    } catch (error) {
      console.error("Wedding lead start error", error);
      // The couple can still finish: the full plan inserts the row then.
      return NextResponse.json({ error: "Could not save your details yet." }, { status: 500 });
    }
  }

  const consultationMethodRaw = str(b.consultationMethod, 40);
  if (consultationMethodRaw && !CONSULTATION_METHODS.includes(consultationMethodRaw)) {
    return NextResponse.json({ error: "Choose a valid consultation method." }, { status: 400 });
  }

  const guestCountRaw = b.guestCount;
  const guestCount = typeof guestCountRaw === "number" && Number.isFinite(guestCountRaw) ? Math.max(0, Math.round(guestCountRaw)) : null;

  const venueIdRaw = b.venueId;
  const venueId = typeof venueIdRaw === "number" && Number.isFinite(venueIdRaw) ? Math.round(venueIdRaw) : null;

  const packageSlug = str(b.packageSlug, 60);
  const selectedPackage = packageSlug ? await getWeddingPackageBySlug(packageSlug) : null;

  try {
    const input = {
      idempotencyKey,
      names,
      email,
      phone: str(b.phone, 60),
      travelOrigin: str(b.travelOrigin, 120),
      ceremonyType: str(b.ceremonyType, 80),
      preferredWeddingDate: str(b.preferredWeddingDate, 20),
      arrivalDate: str(b.arrivalDate, 20),
      guestCount,
      locationIdea: str(b.locationIdea, 500),
      venueId,
      venuePreference: str(b.venuePreference, 120),
      packageId: selectedPackage?.id ?? null,
      requestedServices: strArray(b.requestedServices, 120),
      consultationMethod: (consultationMethodRaw as "phone" | "whatsapp_video" | "guided_text") || null,
      consultationPreferredDate: str(b.consultationPreferredDate, 20),
      consultationPreferredTime: str(b.consultationPreferredTime, 20),
      consultationTimeZone: str(b.consultationTimeZone, 60),
      notes: str(b.notes, 1800),
      contactConsent,
      marketingConsent: b.marketingConsent === true,
      utm: { ...utmRecord(b.utm), planner_stage: "submitted" },
    };
    const lead = (await completeStartedWeddingLead(input)) ?? (await createWeddingLead(input));

    // A retried or replayed submit (same key) returns the saved row with
    // changed false: it gets the same answer and sends nothing again.
    if (!lead.changed) return NextResponse.json({ id: lead.id, publicToken: lead.publicToken });

    const notifyTo = process.env.WEDDING_DESK_NOTIFY_EMAIL;
    if (notifyTo) {
      await sendEmail({
        to: notifyTo,
        log: { template: "wedding_enquiry_notice" },
        subject: `New wedding enquiry — ${lead.names}`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#153c46">
          <h1 style="font-size:20px;margin:0 0 16px">New wedding enquiry</h1>
          <p><strong>${escapeHtml(lead.names)}</strong></p>
          ${selectedPackage ? `<p>Selected package: ${escapeHtml(selectedPackage.name)}</p>` : ""}
          <p>Lead reference: ${escapeHtml(lead.publicToken)}</p>
        </div>`,
      });
    }

    // The couple's own copy, from the business. Off until WEDDING_AUTOREPLY
    // is "on" (lib/weddingAutoReply.ts), at most once a day per address so
    // the form can't be pointed at a stranger's inbox; a failed send or
    // check never fails the plan.
    const reply = email ? weddingAutoReply({ names: lead.names, packageName: selectedPackage?.name ?? null }) : null;
    const repliedToday = reply ? await hadRecentSubmittedWeddingLead(email, lead.id).catch(() => true) : true;
    if (reply && !repliedToday) {
      await sendEmail({ to: email, from: reply.from, replyTo: reply.replyTo, subject: reply.subject, html: reply.html, log: { template: "wedding_enquiry_autoreply" } }).catch(() => "failed");
    }

    return NextResponse.json({ id: lead.id, publicToken: lead.publicToken });
  } catch (error) {
    console.error("Wedding lead creation error", error);
    return NextResponse.json({ error: "Could not save your enquiry. Please try WhatsApp instead." }, { status: 500 });
  }
}
