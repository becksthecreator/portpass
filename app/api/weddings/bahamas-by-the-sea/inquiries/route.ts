import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/db/supabase";
import { sendEmail } from "@/lib/email";

const CONSULTATION_PREFERENCES = ["call", "whatsapp_video", "guided_text"];

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const partnerOneName = asTrimmedString((body as Record<string, unknown>).partnerOneName);
  const partnerTwoName = asTrimmedString((body as Record<string, unknown>).partnerTwoName);
  const contactEmail = asTrimmedString((body as Record<string, unknown>).contactEmail);
  const contactPhone = asTrimmedString((body as Record<string, unknown>).contactPhone);
  const weddingDatePreference = asTrimmedString((body as Record<string, unknown>).weddingDatePreference);
  const guestCountRaw = (body as Record<string, unknown>).guestCountEstimate;
  const ceremonyStyle = asTrimmedString((body as Record<string, unknown>).ceremonyStyle);
  const venuePreference = asTrimmedString((body as Record<string, unknown>).venuePreference);
  const servicesWanted = Array.isArray((body as Record<string, unknown>).servicesWanted)
    ? ((body as Record<string, unknown>).servicesWanted as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const consultationPreference = asTrimmedString((body as Record<string, unknown>).consultationPreference);
  const preferredContactTime = asTrimmedString((body as Record<string, unknown>).preferredContactTime);
  const notes = asTrimmedString((body as Record<string, unknown>).notes);

  if (!partnerOneName) return NextResponse.json({ error: "Tell us at least one partner's name." }, { status: 400 });
  if (!contactEmail || !contactEmail.includes("@")) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  if (consultationPreference && !CONSULTATION_PREFERENCES.includes(consultationPreference)) {
    return NextResponse.json({ error: "Choose a valid consultation preference." }, { status: 400 });
  }

  const guestCountEstimate = typeof guestCountRaw === "number" && Number.isFinite(guestCountRaw) ? Math.max(0, Math.round(guestCountRaw)) : null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_inquiries")
    .insert({
      partner_one_name: partnerOneName,
      partner_two_name: partnerTwoName || null,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      wedding_date_preference: weddingDatePreference || null,
      guest_count_estimate: guestCountEstimate,
      ceremony_style: ceremonyStyle || null,
      venue_preference: venuePreference || null,
      services_wanted: servicesWanted,
      consultation_preference: consultationPreference || null,
      preferred_contact_time: preferredContactTime || null,
      notes: notes || null,
    })
    .select("id")
    .single();
  throwIfSupabaseError(error, "Could not save wedding inquiry");
  if (!data) return NextResponse.json({ error: "Could not save wedding inquiry." }, { status: 500 });

  const notifyTo = process.env.WEDDING_DESK_NOTIFY_EMAIL;
  if (notifyTo) {
    await sendEmail({
      to: notifyTo,
      subject: `New wedding inquiry — ${partnerOneName}${partnerTwoName ? ` & ${partnerTwoName}` : ""}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0e3b3f">
        <h1 style="font-size:20px;margin:0 0 16px">New wedding inquiry</h1>
        <p><strong>${partnerOneName}${partnerTwoName ? ` &amp; ${partnerTwoName}` : ""}</strong></p>
        <p>${contactEmail}${contactPhone ? ` · ${contactPhone}` : ""}</p>
        <p>Preferred date: ${weddingDatePreference || "Not specified"}</p>
        <p>Guests: ${guestCountEstimate ?? "Not specified"}</p>
        <p>Ceremony style: ${ceremonyStyle || "Not specified"}</p>
        <p>Venue preference: ${venuePreference || "Not specified"}</p>
        <p>Services wanted: ${servicesWanted.length ? servicesWanted.join(", ") : "Not specified"}</p>
        <p>Consultation preference: ${consultationPreference || "Not specified"} ${preferredContactTime ? `(${preferredContactTime})` : ""}</p>
        <p>Notes: ${notes || "—"}</p>
      </div>`,
    });
  }

  return NextResponse.json({ id: data.id });
}
