import { NextResponse } from "next/server";
import { clientIp, createRateLimiter } from "@/lib/auth/rateLimit";
import { existingForPlaces, lookupUsage, PLACES_DAILY_CAP, recordLookup } from "@/db/leads";
import { requireAdminApi } from "@/lib/auth/admin";
import { PLACES_SEARCH_COST_MILLICENTS, placesConfigured, searchPlaces } from "@/lib/scout/places";

// Admin -> Leads: a Google Places text search ("party rentals Nassau").
// Official API only. Capped at 200 searches a day (a Nassau day); every
// search is counted so the spend can be shown. Results are shown, not saved: a founder keeps
// the ones worth keeping.
// Per address, per server instance (Brief 21, part E): a stuck button or a
// script cannot hammer this.
const limited = createRateLimiter(30, 10 * 60_000);

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  if (limited(clientIp(request))) return NextResponse.json({ error: "Too many searches in a short time. Wait a few minutes." }, { status: 429 });

  if (!placesConfigured()) return NextResponse.json({ error: "Google Places isn't set up yet (GOOGLE_PLACES_API_KEY)." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 120) : "";
  if (query.length < 3) return NextResponse.json({ error: "Type what to search for, like \"kids football academy Nassau\"." }, { status: 400 });

  const usage = await lookupUsage();
  if (usage.placesLeftToday <= 0) {
    return NextResponse.json({ error: `That's ${PLACES_DAILY_CAP} searches today, the daily limit. It resets at midnight, Nassau time.` }, { status: 429 });
  }

  const result = await searchPlaces(query);
  await recordLookup({ provider: "google_places", query, resultCount: result.ok ? result.places.length : 0, costMillicents: PLACES_SEARCH_COST_MILLICENTS, ok: result.ok, actorUserId: auth.session.userId });
  if (!result.ok) return NextResponse.json({ error: "Google Places didn't answer. Try again in a minute." }, { status: 502 });

  const existing = await existingForPlaces(result.places);
  const places = result.places.map((place) => {
    const match = existing.get(place.placeId) ?? null;
    return { ...place, existing: match ? { id: match.status === "do_not_contact" ? null : match.id, status: match.status } : null };
  });
  return NextResponse.json({ places, searchesLeftToday: usage.placesLeftToday - 1 });
}
