// The link that opens a Futprep private-session booking with a coach and a
// service already chosen (Brief 29, part D): /futprep/book?coach=<slug>&service=<slug>.
// Pure: building the link, reading its query, and the page's title.

export const BOOKING_PATH = "/futprep/book";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function bookingLink(origin: string, coachSlug: string | null, serviceSlug: string | null = null, utm: { source?: string; medium?: string } = {}): string {
  const params = new URLSearchParams();
  if (coachSlug) params.set("coach", coachSlug);
  if (serviceSlug) params.set("service", serviceSlug);
  if (utm.source) params.set("utm_source", utm.source);
  if (utm.medium) params.set("utm_medium", utm.medium);
  const query = params.toString();
  return `${origin.replace(/\/$/, "")}${BOOKING_PATH}${query ? `?${query}` : ""}`;
}

export type BookingParams = { coachSlug: string | null; serviceSlug: string | null; unknown: string[] };

// What the query asked for, against what exists. An unknown slug is dropped
// and named, so the page can say "we couldn't find that coach" and still
// open the form.
export function readBookingParams(query: { coach?: string | string[]; service?: string | string[] }, known: { coaches: readonly string[]; services: readonly string[] }): BookingParams {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const coach = one(query.coach).trim().toLowerCase().slice(0, 80);
  const service = one(query.service).trim().toLowerCase().slice(0, 80);
  const unknown: string[] = [];
  const coachSlug = coach && SLUG.test(coach) && known.coaches.includes(coach) ? coach : null;
  if (coach && !coachSlug) unknown.push("coach");
  const serviceSlug = service && SLUG.test(service) && known.services.includes(service) ? service : null;
  if (service && !serviceSlug) unknown.push("service");
  return { coachSlug, serviceSlug, unknown };
}

// "Coach Bex" from a profile: the nickname when there is one, else the
// display name. Then the page title WhatsApp shows.
export function coachShortName(coach: { display_name: string; nickname?: string | null }): string {
  const nick = coach.nickname?.trim();
  return nick && nick.length <= 40 ? nick : coach.display_name;
}

export function bookingTitle(coach: { display_name: string; nickname?: string | null } | null): string {
  return coach ? `Book a private session with ${coachShortName(coach)} · Futprep` : "Book a private session · Futprep";
}

export function bookingDescription(coach: { display_name: string; nickname?: string | null } | null, services: ReadonlyArray<{ durationMinutes: number; priceCents: number | null; kind: string; isPublished: boolean }>): string {
  const parts = services.filter((s) => s.kind === "session" && s.isPublished && s.priceCents !== null).sort((a, b) => a.durationMinutes - b.durationMinutes).map((s) => `${s.durationMinutes} min $${s.priceCents! / 100}`);
  const who = coach ? `with ${coachShortName(coach)} ` : "";
  return `Request a private football session ${who}in Nassau${parts.length ? `: ${parts.join(" or ")}` : ""}. Pick a time; the coach confirms. Cash or bank transfer.`;
}
