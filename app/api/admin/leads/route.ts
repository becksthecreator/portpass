import { NextResponse } from "next/server";
import { listSections } from "@/db/categories";
import { createLead } from "@/db/leads";
import { requireAdminApi } from "@/lib/auth/admin";
import { parseNewLead } from "@/lib/scout/input";

// Admin -> Leads: add one business to the catalogue (brief 14). A founder
// types it after a conversation, records a referral, or keeps a result
// from a Google Places search. Refused if the business is already there,
// or was marked "do not contact".
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sections = await listSections({ includeHidden: true });
  const parsed = parseNewLead(body, sections);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const place = body?.place && typeof body.place === "object" ? (body.place as Record<string, unknown>) : null;
  const result = await createLead(parsed.draft, {
    actorUserId: auth.session.userId,
    warmConnection: parsed.warmConnection,
    googlePlaceId: typeof place?.placeId === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(place.placeId) ? place.placeId : null,
    googleMapsUrl: typeof place?.mapsUrl === "string" ? place.mapsUrl : null,
    googleRating: typeof place?.rating === "number" && place.rating >= 0 && place.rating <= 5 ? place.rating : null,
    googleRatingCount: typeof place?.ratingCount === "number" && place.ratingCount >= 0 ? Math.round(place.ratingCount) : null,
  });
  if (!result.ok) {
    if (result.reason === "do_not_contact") return NextResponse.json({ error: "This business asked not to be contacted. It can't be added again." }, { status: 409 });
    if (result.reason === "duplicate") return NextResponse.json({ error: "That business is already in Leads.", leadId: result.existingId ?? null }, { status: 409 });
    return NextResponse.json({ error: "Enter the business name." }, { status: 400 });
  }
  return NextResponse.json({ lead: result.lead }, { status: 201 });
}
