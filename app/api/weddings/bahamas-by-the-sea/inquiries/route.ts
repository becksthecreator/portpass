import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/db/supabase";
import { sendEmail } from "@/lib/email";

const CONSULTATION_PREFERENCES = ["Consultation call", "WhatsApp video consultation", "Guided text planning"];

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const names = asTrimmedString(b.names);
  const contactEmail = asTrimmedString(b.contactEmail);
  const ceremonyChoice = asTrimmedString(b.ceremonyChoice);
  const weddingDatePreference = asTrimmedString(b.weddingDatePreference);
  const guestCountRaw = b.guestCountEstimate;
  const arrivalDate = asTrimmedString(b.arrivalDate);
  const locationIdea = asTrimmedString(b.locationIdea);
  const venuePreference = asTrimmedString(b.venuePreference);
  const servicesWanted = asStringArray(b.servicesWanted);
  const consultationPreference = asTrimmedString(b.consultationPreference);
  const consultationDate = asTrimmedString(b.consultationDate);
  const consultationTime = asTrimmedString(b.consultationTime);
  const consultationTimezone = asTrimmedString(b.consultationTimezone);
  const travellingFrom = asTrimmedString(b.travellingFrom);
  const notes = asTrimmedString(b.notes);

  if (!names) return NextResponse.json({ error: "Tell us your names." }, { status: 400 });
  if (consultationPreference && !CONSULTATION_PREFERENCES.includes(consultationPreference)) {
    return NextResponse.json({ error: "Choose a valid consultation preference." }, { status: 400 });
  }

  const guestCountEstimate = typeof guestCountRaw === "number" && Number.isFinite(guestCountRaw) ? Math.max(0, Math.round(guestCountRaw)) : null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_inquiries")
    .insert({
      partner_one_name: names,
      contact_email: contactEmail || null,
      wedding_date_preference: weddingDatePreference || null,
      guest_count_estimate: guestCountEstimate,
      ceremony_style: ceremonyChoice || null,
      venue_preference: venuePreference || null,
      services_wanted: servicesWanted,
      consultation_preference: consultationPreference || null,
      arrival_date: arrivalDate || null,
      location_idea: locationIdea || null,
      travelling_from: travellingFrom || null,
      consultation_date: consultationDate || null,
      consultation_time: consultationTime || null,
      consultation_timezone: consultationTimezone || null,
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
      subject: `New wedding plan request — ${names}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#153c46">
        <h1 style="font-size:20px;margin:0 0 16px">New wedding plan request</h1>
        <p><strong>${names}</strong>${contactEmail ? ` · ${contactEmail}` : ""}</p>
        <p>Celebrating: ${ceremonyChoice || "Not specified"}</p>
        <p>Preferred date: ${weddingDatePreference || "Not specified"} · Arrival: ${arrivalDate || "Not specified"}</p>
        <p>Guests: ${guestCountEstimate ?? "Not specified"} · Travelling from: ${travellingFrom || "Not specified"}</p>
        <p>Venue style: ${venuePreference || "Not specified"} (${locationIdea || "no location idea given"})</p>
        <p>Services requested: ${servicesWanted.length ? servicesWanted.join(", ") : "None selected"}</p>
        <p>Consultation: ${consultationPreference || "Not specified"} ${consultationDate ? `on ${consultationDate}` : ""} ${consultationTime || ""} ${consultationTimezone ? `(${consultationTimezone})` : ""}</p>
        <p>Notes: ${notes || "—"}</p>
      </div>`,
    });
  }

  return NextResponse.json({ id: data.id });
}
