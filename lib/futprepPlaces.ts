// Places left in each open Futprep class, for the register's live count
// (V4). Only the count goes out: no names, no capacity, no internal ids
// beyond the class's own slug and term, which the page already shows. A
// class that only opens through a returning family's personal link is not
// listed. The number is advice; the registration itself is still refused
// under the class's lock when the last place has gone (PROGRAM_FULL).

export type PlacesLeft = { slug: string; termId: number; placesLeft: number; full: boolean };

type Offer = { slug: string; termId: number; spotsRemaining: number; earlyAccessOnly: boolean };

export function placesLeft(offers: readonly Offer[]): PlacesLeft[] {
  return offers
    .filter((o) => !o.earlyAccessOnly)
    .map((o) => {
      const left = Math.max(0, Math.floor(Number(o.spotsRemaining) || 0));
      return { slug: o.slug, termId: o.termId, placesLeft: left, full: left === 0 };
    });
}
