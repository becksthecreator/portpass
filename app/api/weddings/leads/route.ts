import { NextRequest, NextResponse } from "next/server";
import { createWeddingLead } from "@/db/weddingLeads";
import { sendEmail } from "@/lib/email";

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

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
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

  const consultationMethodRaw = str(b.consultationMethod, 40);
  if (consultationMethodRaw && !CONSULTATION_METHODS.includes(consultationMethodRaw)) {
    return NextResponse.json({ error: "Choose a valid consultation method." }, { status: 400 });
  }

  const guestCountRaw = b.guestCount;
  const guestCount = typeof guestCountRaw === "number" && Number.isFinite(guestCountRaw) ? Math.max(0, Math.round(guestCountRaw)) : null;

  const venueIdRaw = b.venueId;
  const venueId = typeof venueIdRaw === "number" && Number.isFinite(venueIdRaw) ? Math.round(venueIdRaw) : null;

  try {
    const lead = await createWeddingLead({
      idempotencyKey,
      names,
      email: str(b.email, 254),
      phone: str(b.phone, 60),
      travelOrigin: str(b.travelOrigin, 120),
      ceremonyType: str(b.ceremonyType, 80),
      preferredWeddingDate: str(b.preferredWeddingDate, 20),
      arrivalDate: str(b.arrivalDate, 20),
      guestCount,
      locationIdea: str(b.locationIdea, 500),
      venueId,
      venuePreference: str(b.venuePreference, 120),
      requestedServices: strArray(b.requestedServices, 120),
      consultationMethod: (consultationMethodRaw as "phone" | "whatsapp_video" | "guided_text") || null,
      consultationPreferredDate: str(b.consultationPreferredDate, 20),
      consultationPreferredTime: str(b.consultationPreferredTime, 20),
      consultationTimeZone: str(b.consultationTimeZone, 60),
      notes: str(b.notes, 1800),
      contactConsent,
      marketingConsent: b.marketingConsent === true,
      utm: utmRecord(b.utm),
    });

    const notifyTo = process.env.WEDDING_DESK_NOTIFY_EMAIL;
    if (notifyTo) {
      await sendEmail({
        to: notifyTo,
        subject: `New wedding enquiry — ${lead.names}`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#153c46">
          <h1 style="font-size:20px;margin:0 0 16px">New wedding enquiry</h1>
          <p><strong>${lead.names}</strong></p>
          <p>Lead reference: ${lead.publicToken}</p>
        </div>`,
      });
    }

    return NextResponse.json({ id: lead.id, publicToken: lead.publicToken });
  } catch (error) {
    console.error("Wedding lead creation error", error);
    return NextResponse.json({ error: "Could not save your enquiry. Please try WhatsApp instead." }, { status: 500 });
  }
}
