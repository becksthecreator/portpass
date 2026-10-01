import { cleanUrl } from "./leads";

// Google Places API (New), Text Search: one of the sources PortPass Scout
// is allowed to use (brief 14 §1). A founder types a search such as "kids
// football academy Nassau"; Google returns businesses' own published
// details. This is the official API, not scraping. The key is the server
// env var GOOGLE_PLACES_API_KEY and never reaches the browser.

export const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

// Only what the brief says to store: name, category, address, phone,
// website, rating and count, and the Maps link. Asking for fewer fields
// also keeps each search on the cheaper price tier.
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryTypeDisplayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.businessStatus",
].join(",");

// Google's published price for a Text Search that returns contact details
// and ratings is $35 per 1,000 requests. Kept as an estimate for the spend
// shown in admin, in thousandths of a cent.
export const PLACES_SEARCH_COST_MILLICENTS = 3500;

export type PlaceResult = {
  placeId: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  internationalPhone: string | null;
  websiteUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  mapsUrl: string | null;
};

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

export function placesRequestBody(query: string): { textQuery: string; regionCode: string; maxResultCount: number; languageCode: string } {
  return { textQuery: query.trim().slice(0, 120), regionCode: "BS", maxResultCount: 20, languageCode: "en" };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// One place from Google's response, or null when it has no id or name, or
// has closed for good.
export function mapPlace(raw: unknown): PlaceResult | null {
  if (!raw || typeof raw !== "object") return null;
  const place = raw as Record<string, unknown>;
  const placeId = text(place.id);
  const name = text((place.displayName as { text?: unknown } | undefined)?.text);
  if (!placeId || !name) return null;
  if (place.businessStatus === "CLOSED_PERMANENTLY") return null;
  const rating = typeof place.rating === "number" && place.rating >= 0 && place.rating <= 5 ? Math.round(place.rating * 10) / 10 : null;
  const ratingCount = typeof place.userRatingCount === "number" && place.userRatingCount >= 0 ? Math.round(place.userRatingCount) : null;
  return {
    placeId,
    name: name.slice(0, 160),
    category: text((place.primaryTypeDisplayName as { text?: unknown } | undefined)?.text),
    address: text(place.formattedAddress),
    phone: text(place.nationalPhoneNumber),
    internationalPhone: text(place.internationalPhoneNumber),
    websiteUrl: cleanUrl(text(place.websiteUri)),
    rating,
    ratingCount,
    mapsUrl: cleanUrl(text(place.googleMapsUri)),
  };
}

export type PlacesSearch = { ok: true; places: PlaceResult[] } | { ok: false; reason: "not_configured" | "bad_query" | "provider_error"; status?: number };

export async function searchPlaces(query: string, fetcher: typeof fetch = fetch): Promise<PlacesSearch> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  if (query.trim().length < 3) return { ok: false, reason: "bad_query" };
  try {
    const response = await fetcher(PLACES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACES_FIELD_MASK },
      body: JSON.stringify(placesRequestBody(query)),
    });
    if (!response.ok) {
      console.error("scout places search failed", response.status);
      return { ok: false, reason: "provider_error", status: response.status };
    }
    const data = (await response.json()) as { places?: unknown[] };
    return { ok: true, places: (data.places ?? []).map(mapPlace).filter((p): p is PlaceResult => p !== null) };
  } catch (error) {
    console.error("scout places search threw", error instanceof Error ? error.message : "");
    return { ok: false, reason: "provider_error" };
  }
}
