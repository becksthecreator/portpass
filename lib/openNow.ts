// "Open now" on the homepage (brief 18, A2): what a visitor can book
// soonest, from the data. Anything with a closing date comes first, the
// one closing soonest at the top, and says how long is left. Pure rules,
// shared by the page and its tests.
import { formatDateRange, nassauToday } from "@/lib/futprepTerms";

const DAY_MS = 86_400_000;
const CLOSES_ON = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Nassau" });

// Whole Nassau calendar days from today to the day registration closes;
// null once it has closed.
export function daysUntilClose(closesAtIso: string, now: Date = new Date()): number | null {
  const closes = new Date(closesAtIso);
  if (Number.isNaN(closes.getTime()) || closes.getTime() <= now.getTime()) return null;
  const today = Date.parse(`${nassauToday(now)}T00:00:00Z`);
  const closeDay = Date.parse(`${nassauToday(closes)}T00:00:00Z`);
  return Math.round((closeDay - today) / DAY_MS);
}

// "Closes today", "Closes tomorrow", "Closes in 10 days".
export function closesInLabel(closesAtIso: string | null, now: Date = new Date()): string | null {
  if (!closesAtIso) return null;
  const days = daysUntilClose(closesAtIso, now);
  if (days === null) return null;
  if (days <= 0) return "Closes today";
  return days === 1 ? "Closes tomorrow" : `Closes in ${days} days`;
}

const dollars = (cents: number): string => `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;

export type DatedOffer = { name: string; termStartDate: string; termEndDate: string; ageLabel: string; termFeeCents: number; registrationClosesAt: string | null };

// "15–16 Oct · Ages 6–15 · $100 · closes Wed 14 Oct"
export function datedOfferLine(offer: DatedOffer): string {
  const parts = [formatDateRange(offer.termStartDate, offer.termEndDate), `Ages ${offer.ageLabel}`, dollars(offer.termFeeCents)];
  if (offer.registrationClosesAt) parts.push(`closes ${CLOSES_ON.format(new Date(offer.registrationClosesAt))}`);
  return parts.join(" · ");
}

// Cards with a closing date first (soonest first); the rest keep the order
// they came in (the founders' spotlight order).
export function orderOpenNow<T extends { closesAt?: string | null }>(cards: T[]): T[] {
  const time = (card: T) => (card.closesAt ? new Date(card.closesAt).getTime() : Number.POSITIVE_INFINITY);
  return cards.map((card, index) => ({ card, index })).sort((a, b) => time(a.card) - time(b.card) || a.index - b.index).map(({ card }) => card);
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

// The hero's last sentence, from how many businesses are open: "Two are
// open right now." Nothing when the count isn't known.
export function openCountSentence(count: number): string {
  if (count <= 0) return "";
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} ${count === 1 ? "is" : "are"} open right now.`;
}
