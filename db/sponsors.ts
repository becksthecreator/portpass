import type { Sponsor, SponsorInput, SponsorStatus } from "@/lib/sponsors";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Admin -> Leads -> Sponsors (brief 08, 1.8): a business that gives
// PortPass something (a banner, shirts, printing) and what PortPass gives
// back. Business details only, typed by a founder. Platform staff only.

const COLUMNS = "id,name,item,value_cents,what_we_give,status,notes,updated_at";

function toSponsor(row: Record<string, unknown>): Sponsor {
  return { id: Number(row.id), name: String(row.name), item: String(row.item ?? ""), valueCents: row.value_cents === null || row.value_cents === undefined ? null : Number(row.value_cents), whatWeGive: String(row.what_we_give ?? ""), status: row.status as SponsorStatus, notes: String(row.notes ?? ""), updatedAt: String(row.updated_at) };
}

const toRow = (input: SponsorInput) => ({ name: input.name, item: input.item, value_cents: input.valueCents, what_we_give: input.whatWeGive, status: input.status, notes: input.notes });

export async function listSponsors(): Promise<Sponsor[]> {
  const { data, error } = await getSupabaseAdmin().from("sponsors").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
  throwIfSupabaseError(error, "Could not load sponsors");
  return (data ?? []).map((row) => toSponsor(row as Record<string, unknown>));
}

export async function createSponsor(input: SponsorInput, actorUserId: string): Promise<Sponsor> {
  const { data, error } = await getSupabaseAdmin().from("sponsors").insert({ ...toRow(input), created_by: actorUserId }).select(COLUMNS).single();
  throwIfSupabaseError(error, "Could not add the sponsor");
  const sponsor = toSponsor(data as Record<string, unknown>);
  await logAudit({ actorUserId, action: "sponsor.created", targetTable: "sponsors", targetId: sponsor.id, after: toRow(input) });
  return sponsor;
}

export async function updateSponsor(id: number, input: SponsorInput, actorUserId: string): Promise<Sponsor> {
  const db = getSupabaseAdmin();
  const { data: before, error: beforeError } = await db.from("sponsors").select(COLUMNS).eq("id", id).maybeSingle();
  throwIfSupabaseError(beforeError, "Could not load the sponsor");
  if (!before) throw new Error("NOT_FOUND");
  const { data, error } = await db.from("sponsors").update({ ...toRow(input), updated_at: new Date().toISOString() }).eq("id", id).select(COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not save the sponsor");
  if (!data) throw new Error("NOT_FOUND");
  await logAudit({ actorUserId, action: "sponsor.updated", targetTable: "sponsors", targetId: id, before: toRow({ ...toSponsor(before as Record<string, unknown>) }), after: toRow(input) });
  return toSponsor(data as Record<string, unknown>);
}

export async function deleteSponsor(id: number, actorUserId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: before, error: beforeError } = await db.from("sponsors").select(COLUMNS).eq("id", id).maybeSingle();
  throwIfSupabaseError(beforeError, "Could not load the sponsor");
  if (!before) throw new Error("NOT_FOUND");
  // The copy goes into the audit log first: a removed row can't be read back.
  await logAudit({ actorUserId, action: "sponsor.removed", targetTable: "sponsors", targetId: id, before: toRow({ ...toSponsor(before as Record<string, unknown>) }) });
  const { error } = await db.from("sponsors").delete().eq("id", id);
  throwIfSupabaseError(error, "Could not remove the sponsor");
}
