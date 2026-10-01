"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Place = {
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
  existing: { id: number | null; status: string } | null;
};

// Google Places text search (the official API). Results are shown, not
// saved: keep the ones worth keeping. Each search counts towards the daily
// limit of 200.
export function PlacesSearch({ configured, searchesLeft }: { configured: boolean; searchesLeft: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [left, setLeft] = useState(searchesLeft);
  const [kept, setKept] = useState<Record<string, number | "busy" | "failed">>({});

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("query") ?? "");
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/leads/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { error?: string; places?: Place[]; searchesLeftToday?: number }) : {};
    setBusy(false);
    if (!response || !response.ok) {
      setError(data.error ?? "The search didn't work.");
      return;
    }
    setPlaces(data.places ?? []);
    if (typeof data.searchesLeftToday === "number") setLeft(data.searchesLeftToday);
  }

  async function keep(place: Place) {
    setKept((current) => ({ ...current, [place.placeId]: "busy" }));
    const response = await fetch("/api/admin/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: place.name,
        source: "google_places",
        whatTheyDo: place.category,
        address: place.address,
        phone: place.internationalPhone ?? place.phone,
        websiteUrl: place.websiteUrl,
        mapsUrl: place.mapsUrl,
        place: { placeId: place.placeId, mapsUrl: place.mapsUrl, rating: place.rating, ratingCount: place.ratingCount },
      }),
    }).catch(() => null);
    const data = response ? ((await response.json().catch(() => ({}))) as { lead?: { id: number } }) : {};
    setKept((current) => ({ ...current, [place.placeId]: response?.ok && data.lead ? data.lead.id : "failed" }));
    if (response?.ok) router.refresh();
  }

  if (!open) {
    return <button type="button" className="admin-bar-link leads-add-toggle" onClick={() => setOpen(true)}>Search Google Places</button>;
  }
  return (
    <div className="admin-form leads-search">
      <h2>Search Google Places</h2>
      {!configured ? (
        <p className="leads-add-note">Not set up yet. It switches on when GOOGLE_PLACES_API_KEY is added in Vercel.</p>
      ) : (
        <>
          <p className="leads-add-note">Search by category and area. {left} of 200 searches left today.</p>
          <form onSubmit={search} className="leads-search-form">
            <label><span>Search</span><input name="query" required minLength={3} maxLength={120} placeholder="kids football academy Nassau" /></label>
            <button className="primary-button" type="submit" disabled={busy || left <= 0}>{busy ? "Searching…" : "Search"}</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          {places && places.length === 0 && <p className="admin-empty">Nothing found for that search.</p>}
          {places && places.length > 0 && (
            <ul className="leads-places">
              {places.map((place) => {
                const state = kept[place.placeId];
                return (
                  <li key={place.placeId}>
                    <div>
                      <strong>{place.name}</strong>
                      <small>{[place.category, place.address].filter(Boolean).join(" · ")}</small>
                      <small>{[place.phone, place.rating !== null ? `${place.rating} stars (${place.ratingCount ?? 0})` : null].filter(Boolean).join(" · ")}</small>
                    </div>
                    {place.existing ? (
                      place.existing.status === "do_not_contact" || place.existing.id === null
                        ? <span className="admin-pill">Do not contact</span>
                        : <Link href={`/admin/leads/${place.existing.id}`}>Already a lead</Link>
                    ) : typeof state === "number" ? (
                      <Link href={`/admin/leads/${state}`}>Added: open</Link>
                    ) : (
                      <button type="button" className="admin-bar-link" disabled={state === "busy"} onClick={() => keep(place)}>{state === "busy" ? "Adding…" : state === "failed" ? "Try again" : "Keep as a lead"}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <button type="button" className="admin-bar-link" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
}
