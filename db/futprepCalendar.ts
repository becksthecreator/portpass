import { listFutprepOffers } from "./registrations";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import type { CalendarInput } from "@/lib/ics";

// The register's "Add all 10 to my calendar" (V4): one listed class's
// scheduled sessions inside its term. A session outside the term's dates
// (a taster day) or one called off is left out. Read only for a class on
// the public list, so an unlisted or early-access-only class isn't exposed.
// Nothing about a child or a parent is read.
export async function futprepClassCalendar(programSlug: string, termId: number): Promise<CalendarInput | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(programSlug) || !Number.isInteger(termId) || termId <= 0) return null;
  const offer = (await listFutprepOffers({ publicOnly: true })).find((o) => o.slug === programSlug && o.termId === termId && !o.earlyAccessOnly);
  if (!offer) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("sessions")
    .select("session_date,start_time,location")
    .eq("program_id", offer.programId)
    .eq("term_id", offer.termId)
    .eq("status", "scheduled")
    .gte("session_date", offer.termStartDate)
    .lte("session_date", offer.termEndDate)
    .order("session_date", { ascending: true })
    .limit(200);
  throwIfSupabaseError(error, "Could not read the class's sessions");

  const start = offer.dailyStartTime || offer.time;
  const end = offer.dailyEndTime || offer.endTime;
  const place = [offer.location, offer.locationNote].filter(Boolean).join(", ");
  return {
    uidPrefix: `futprep-${offer.slug}-${offer.termId}`,
    title: `Futprep ${offer.name.replace(/^Futprep\s+/i, "")} · ${offer.termName}`,
    location: place,
    description: "Futprep Athletics. Bring water and trainers or football boots. Questions: message Futprep on WhatsApp.",
    sessions: ((data ?? []) as Array<{ session_date: string; start_time: string | null }>).map((s) => ({ date: s.session_date, start: s.start_time || start, end })),
  };
}
