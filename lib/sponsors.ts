// Admin -> Leads -> Sponsors (brief 08, 1.8): the shapes and the form check,
// with no database in them. The queries are in db/sponsors.ts.

export const SPONSOR_STATUSES = ["talking", "agreed", "delivered", "ended"] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];
export const SPONSOR_STATUS_LABEL: Record<SponsorStatus, string> = { talking: "Talking", agreed: "Agreed", delivered: "Delivered", ended: "Ended" };

export type Sponsor = { id: number; name: string; item: string; valueCents: number | null; whatWeGive: string; status: SponsorStatus; notes: string; updatedAt: string };
export type SponsorInput = { name: string; item: string; valueCents: number | null; whatWeGive: string; status: SponsorStatus; notes: string };

const clip = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

// What a form sends, checked. A value is whole dollars and cents, never
// negative, and at most a million dollars (a typo guard).
export function cleanSponsor(input: unknown): { ok: true; value: SponsorInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
  const raw = input as Record<string, unknown>;
  const name = clip(raw.name, 120);
  if (!name) return { ok: false, error: "Enter the sponsor's name." };
  const status = SPONSOR_STATUSES.find((s) => s === raw.status);
  if (!status) return { ok: false, error: "Choose where it stands." };
  let valueCents: number | null = null;
  if (raw.valueCents !== null && raw.valueCents !== undefined && raw.valueCents !== "") {
    if (typeof raw.valueCents !== "number" || !Number.isInteger(raw.valueCents) || raw.valueCents < 0 || raw.valueCents > 100_000_000) return { ok: false, error: "The value is an amount in dollars." };
    valueCents = raw.valueCents;
  }
  return { ok: true, value: { name, item: clip(raw.item, 200), valueCents, whatWeGive: clip(raw.whatWeGive, 300), status, notes: clip(raw.notes, 600) } };
}

