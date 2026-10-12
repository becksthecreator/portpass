// Where Futprep trains and what each place costs (brief 31, B1). What a
// staff member types on Staff -> Locations, checked and turned into what
// the database keeps (supabase/migrations/202610210002). Pure: shared by
// the API, the screens and the tests. Futprep enters every amount itself;
// nothing here sets a price.

import { LOCATION_COST_MODELS, type LocationCostModel } from "./coachPay";
import { dollarsToCents } from "./registrations/programInput";

export type LocationSurface = "grass" | "turf" | "court" | "indoor";
export const LOCATION_SURFACES: LocationSurface[] = ["grass", "turf", "court", "indoor"];

export type FutprepLocation = {
  id: number;
  name: string;
  area: string | null;
  address: string | null;
  active: boolean;
  costModel: LocationCostModel | null;
  costCents: number | null;
  costNote: string | null;
  surface: LocationSurface | null;
  privateSessionsOk: boolean;
  daysAvailable: number[] | null;
  hoursNote: string | null;
  programs: number;
};

export type LocationInput = {
  name: string;
  area: string | null;
  address: string | null;
  costModel: LocationCostModel | null;
  costCents: number | null;
  costNote: string | null;
  surface: LocationSurface | null;
  privateSessionsOk: boolean;
  daysAvailable: number[] | null;
  hoursNote: string | null;
};

type Parsed = { ok: true; value: LocationInput } | { ok: false; error: string };

const text = (value: unknown, max: number): string | null => {
  const clean = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return clean ? clean.slice(0, max) : null;
};

export const COST_MODEL_LABELS: Record<LocationCostModel, string> = {
  per_hour: "By the hour",
  per_session: "By the session",
  per_term: "By the term",
  free: "Free",
  school_pays: "The school pays",
};

export const SURFACE_LABELS: Record<LocationSurface, string> = { grass: "Grass", turf: "Turf", court: "Court", indoor: "Indoor" };

// ISO weekdays, 1 = Monday, as coach_profiles.working_days.
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Free and school-paid places have no amount; the others need one before
// they count as costed, but may be saved without it ("Alex to confirm").
export function needsAmount(model: LocationCostModel | null): boolean {
  return model === "per_hour" || model === "per_session" || model === "per_term";
}

export function parseLocationInput(body: Record<string, unknown>): Parsed {
  const fail = (error: string): Parsed => ({ ok: false, error });
  const name = text(body.name, 120);
  if (!name || name.length < 3) return fail("Give the place a name.");

  const rawModel = body.costModel === "" || body.costModel === null || body.costModel === undefined ? null : body.costModel;
  if (rawModel !== null && !LOCATION_COST_MODELS.includes(rawModel as LocationCostModel)) return fail("Choose how the place is paid for.");
  const costModel = rawModel as LocationCostModel | null;

  const rawCost = body.cost === "" || body.cost === null || body.cost === undefined ? null : body.cost;
  let costCents: number | null = null;
  if (needsAmount(costModel) && rawCost !== null) {
    costCents = dollarsToCents(rawCost);
    if (costCents === null) return fail("Enter what it costs in dollars, like 40 or 40.50.");
    // The database keeps up to $100,000 (locations_cost_cents_check).
    if (costCents > 10_000_000) return fail("That amount is too large. Enter what it costs in dollars, like 40 or 40.50.");
  }

  const rawSurface = body.surface === "" || body.surface === null || body.surface === undefined ? null : body.surface;
  if (rawSurface !== null && !LOCATION_SURFACES.includes(rawSurface as LocationSurface)) return fail("Choose the surface.");

  let daysAvailable: number[] | null = null;
  if (body.daysAvailable !== null && body.daysAvailable !== undefined) {
    if (!Array.isArray(body.daysAvailable)) return fail("Choose the days it can be used.");
    const days = body.daysAvailable.map(Number);
    if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return fail("Choose the days it can be used.");
    daysAvailable = [...new Set(days)].sort((a, b) => a - b);
  }

  return {
    ok: true,
    value: {
      name,
      area: text(body.area, 80),
      address: text(body.address, 200),
      costModel,
      costCents,
      costNote: text(body.costNote, 300),
      surface: rawSurface as LocationSurface | null,
      privateSessionsOk: body.privateSessionsOk === true,
      daysAvailable,
      hoursNote: text(body.hoursNote, 300),
    },
  };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// "$40 an hour", "$25 a session", "$800 a term", "Free", "The school pays",
// or "Not set" / "$? an hour (not set)" while the amount is missing.
export function costLabel(location: Pick<FutprepLocation, "costModel" | "costCents">): string {
  const { costModel, costCents } = location;
  if (!costModel) return "Not set";
  if (costModel === "free") return "Free";
  if (costModel === "school_pays") return "The school pays";
  const per = costModel === "per_hour" ? "an hour" : costModel === "per_session" ? "a session" : "a term";
  return costCents === null ? `Amount not set (${per})` : `${dollars(costCents)} ${per}`;
}

// Whether the place's cost is known well enough to estimate a term.
export function isCosted(location: Pick<FutprepLocation, "costModel" | "costCents">): boolean {
  if (!location.costModel) return false;
  return !needsAmount(location.costModel) || location.costCents !== null;
}

export function daysLabel(days: number[] | null): string {
  if (!days || days.length === 0) return "Days not set";
  if (days.length === 7) return "Every day";
  return days.map((day) => WEEKDAY_SHORT[day - 1]).join(", ");
}
