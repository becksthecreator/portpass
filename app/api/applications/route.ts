import { NextRequest, NextResponse } from "next/server";
import { createApplication } from "@/db/applications";
import { sendApplicationReceivedEmail } from "@/lib/email";
import { normalizePhoneE164 } from "@/lib/phone";
import { isSectionSlug } from "@/lib/sections";

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

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
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

  if (!contactPerson || !organizationName) {
    return NextResponse.json({ error: "Tell us your name and your business name." }, { status: 400 });
  }
  if (!isSectionSlug(section)) {
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
    });
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
    });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    console.error("Listing application error", error);
    return NextResponse.json({ error: "We couldn’t save that. Please try again, or message us on WhatsApp." }, { status: 500 });
  }
}
