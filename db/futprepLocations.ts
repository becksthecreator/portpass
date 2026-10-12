import type { LocationCostModel } from "@/lib/coachPay";
import type { FutprepLocation, LocationInput, LocationSurface } from "@/lib/futprepLocations";
import { logAudit } from "./audit";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Futprep's places and what each costs (brief 31, B1): Staff -> Locations,
// for the CEO and admin logins. Every change leaves an audit line; a place
// is switched off, never deleted, because programs and old requests point
// at it.

const COLUMNS = "id,name,map_label,address,active,cost_model,cost_cents,cost_note,surface,private_sessions_ok,days_available,hours_note";

type Row = {
  id: number; name: string; map_label: string | null; address: string | null; active: boolean;
  cost_model: string | null; cost_cents: number | null; cost_note: string | null; surface: string | null;
  private_sessions_ok: boolean; days_available: number[] | null; hours_note: string | null;
};

function toLocation(row: Row, programs: number): FutprepLocation {
  return {
    id: Number(row.id),
    name: row.name,
    area: row.map_label ?? null,
    address: row.address ?? null,
    active: Boolean(row.active),
    costModel: (row.cost_model as LocationCostModel | null) ?? null,
    costCents: row.cost_cents === null ? null : Number(row.cost_cents),
    costNote: row.cost_note ?? null,
    surface: (row.surface as LocationSurface | null) ?? null,
    privateSessionsOk: Boolean(row.private_sessions_ok),
    daysAvailable: row.days_available ? row.days_available.map(Number) : null,
    hoursNote: row.hours_note ?? null,
    programs,
  };
}

function toRow(input: LocationInput) {
  return {
    name: input.name,
    map_label: input.area,
    // locations.address is NOT NULL: a blank one is kept as "".
    address: input.address ?? "",
    cost_model: input.costModel,
    cost_cents: input.costCents,
    cost_note: input.costNote,
    surface: input.surface,
    private_sessions_ok: input.privateSessionsOk,
    days_available: input.daysAvailable,
    hours_note: input.hoursNote,
  };
}

// Every place, on or off, with how many active programs use it.
export async function listFutprepLocations(): Promise<FutprepLocation[]> {
  const db = getSupabaseAdmin();
  // Futprep found by its slug, as its programs are (db/programs.ts).
  const orgId = await futprepOrganizationId();
  const [{ data, error }, { data: programs, error: programError }] = await Promise.all([
    db.from("locations").select(COLUMNS).eq("organization_id", orgId).order("active", { ascending: false }).order("name"),
    db.from("programs").select("location_id").eq("organization_id", orgId).eq("active", true).not("location_id", "is", null),
  ]);
  throwIfSupabaseError(error, "Could not load Futprep locations");
  throwIfSupabaseError(programError, "Could not count programs per location");
  const uses = new Map<number, number>();
  for (const program of programs ?? []) uses.set(Number(program.location_id), (uses.get(Number(program.location_id)) ?? 0) + 1);
  return ((data ?? []) as Row[]).map((row) => toLocation(row, uses.get(Number(row.id)) ?? 0));
}

export async function createFutprepLocation(input: LocationInput, actorName: string): Promise<number> {
  const db = getSupabaseAdmin();
  // Futprep found by its slug, as its programs are (db/programs.ts).
  const orgId = await futprepOrganizationId();
  const { data, error } = await db.from("locations").insert({ organization_id: orgId, active: true, ...toRow(input) }).select("id").single();
  if (error?.code === "23505") throw new Error("NAME_TAKEN");
  throwIfSupabaseError(error, "Could not add the location");
  const id = Number(data!.id);
  await logAudit({ organizationId: orgId, action: "location.added", targetTable: "locations", targetId: id, after: { ...toRow(input), by: actorName } });
  return id;
}

export async function updateFutprepLocation(id: number, input: LocationInput, actorName: string): Promise<void> {
  const db = getSupabaseAdmin();
  // Futprep found by its slug, as its programs are (db/programs.ts).
  const orgId = await futprepOrganizationId();
  const { data: before, error: loadError } = await db.from("locations").select(COLUMNS).eq("id", id).eq("organization_id", orgId).maybeSingle();
  throwIfSupabaseError(loadError, "Could not load the location");
  if (!before) throw new Error("LOCATION_NOT_FOUND");
  const after = toRow(input);
  const { error } = await db.from("locations").update(after).eq("id", id).eq("organization_id", orgId);
  if (error?.code === "23505") throw new Error("NAME_TAKEN");
  throwIfSupabaseError(error, "Could not save the location");
  await logAudit({ organizationId: orgId, action: "location.updated", targetTable: "locations", targetId: id, before, after: { ...after, by: actorName } });
}

export async function setFutprepLocationActive(id: number, active: boolean, actorName: string): Promise<void> {
  const db = getSupabaseAdmin();
  // Futprep found by its slug, as its programs are (db/programs.ts).
  const orgId = await futprepOrganizationId();
  const { data: place, error: loadError } = await db.from("locations").select("id,active").eq("id", id).eq("organization_id", orgId).maybeSingle();
  throwIfSupabaseError(loadError, "Could not load the location");
  if (!place) throw new Error("LOCATION_NOT_FOUND");
  if (Boolean(place.active) === active) return;
  const { data, error } = await db.from("locations").update({ active }).eq("id", id).eq("organization_id", orgId).eq("active", !active).select("id").maybeSingle();
  throwIfSupabaseError(error, "Could not switch the location");
  if (!data) return;
  await logAudit({ organizationId: orgId, action: active ? "location.switched_on" : "location.switched_off", targetTable: "locations", targetId: id, before: { active: !active }, after: { active, by: actorName } });
}
