// What a customer typed into "Request to book", checked (brief 19, part
// A). Pure: the route hands it the body, today's date in Nassau and
// whether the offering is for under-18s, and gets back either the clean
// request or the sentence to show.
import { cleanHost } from "@/lib/attribution";
import { normalizePhoneE164 } from "@/lib/phone";
import { isClockTime, isIsoDay, lastBookableDay } from "./rules";

export type BookingInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  guardianConfirmed: boolean;
  childFirstName: string | null;
  requestedDate: string;
  requestedTime: string | null;
  durationOrQty: string;
  locationText: string;
  notes: string;
  attribution: { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; referrerHost: string | null; viaPortpass: boolean };
};

export type ParsedBooking = { ok: true; value: BookingInput } | { ok: false; error: string; field?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function line(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// Notes keep their line breaks.
function paragraph(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
}

function tag(value: unknown): string | null {
  const v = line(value, 80);
  return v && /^[\w.\-:+ ]+$/.test(v) ? v : null;
}

const fail = (error: string, field?: string): ParsedBooking => ({ ok: false, error, field });

export function parseBookingInput(body: Record<string, unknown>, options: { today: string; forChildren: boolean }): ParsedBooking {
  const requestedDate = body.requestedDate;
  if (!isIsoDay(requestedDate)) return fail("Choose the date you'd like.", "requestedDate");
  if (requestedDate < options.today) return fail("That date has passed. Choose a date from today on.", "requestedDate");
  if (requestedDate > lastBookableDay(options.today)) return fail("Choose a date within the next two years.", "requestedDate");

  const typedTime = line(body.requestedTime, 5);
  if (typedTime && !isClockTime(typedTime)) return fail("Enter the time as hours and minutes, or leave it blank.", "requestedTime");

  const customerName = line(body.customerName, 120);
  if (customerName.length < 2) return fail("Enter your name.", "customerName");

  const customerPhone = normalizePhoneE164(line(body.customerPhone, 40));
  if (!customerPhone) return fail("Enter a phone or WhatsApp number you can be reached on.", "customerPhone");

  const customerEmail = line(body.customerEmail, 254).toLowerCase();
  if (!EMAIL.test(customerEmail)) return fail("Enter a valid email address. Your confirmation goes there.", "customerEmail");

  let childFirstName: string | null = null;
  if (options.forChildren) {
    // First name only, whatever was typed.
    childFirstName = line(body.childFirstName, 60).split(" ")[0] || null;
    if (!childFirstName) return fail("Enter the child's first name.", "childFirstName");
    if (body.guardianConfirmed !== true) return fail("Tick the box to say you are the child's parent or guardian.", "guardianConfirmed");
  }

  const attribution = (body.attribution && typeof body.attribution === "object" ? body.attribution : {}) as Record<string, unknown>;
  return {
    ok: true,
    value: {
      customerName,
      customerEmail,
      customerPhone,
      guardianConfirmed: options.forChildren,
      childFirstName,
      requestedDate,
      requestedTime: typedTime || null,
      durationOrQty: line(body.durationOrQty, 60),
      locationText: line(body.locationText, 200),
      notes: paragraph(body.notes, 1000),
      attribution: {
        utmSource: tag(attribution.utmSource),
        utmMedium: tag(attribution.utmMedium),
        utmCampaign: tag(attribution.utmCampaign),
        referrerHost: cleanHost(typeof attribution.referrerHost === "string" ? attribution.referrerHost : null),
        viaPortpass: attribution.viaPortpass === true,
      },
    },
  };
}
