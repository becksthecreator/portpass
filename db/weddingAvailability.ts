import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Public surface: just the dates, never the private reason.
export async function getPublicUnavailableDates(): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_unavailable_dates")
    .select("on_date")
    .gte("on_date", new Date().toISOString().slice(0, 10));
  throwIfSupabaseError(error, "Could not load availability");
  return (data ?? []).map((row) => row.on_date as string);
}

export type WeddingUnavailableDate = {
  id: number;
  onDate: string;
  note: string | null;
  createdAt: string;
};

export async function listUnavailableDatesAdmin(): Promise<WeddingUnavailableDate[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_unavailable_dates")
    .select("id,on_date,note,created_at")
    .order("on_date", { ascending: true });
  throwIfSupabaseError(error, "Could not load blocked dates");
  return (data ?? []).map((row) => ({ id: Number(row.id), onDate: row.on_date as string, note: row.note as string | null, createdAt: row.created_at as string }));
}

export async function addUnavailableDate(onDate: string, note: string | null, createdByStaffId: number | null): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(onDate)) throw new Error("INVALID_DATE");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("wedding_unavailable_dates")
    .insert({ on_date: onDate, note: note?.trim() || null, created_by: createdByStaffId });
  if (error?.code === "23505") throw new Error("ALREADY_BLOCKED");
  throwIfSupabaseError(error, "Could not block that date");
}

export async function removeUnavailableDate(id: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wedding_unavailable_dates").delete().eq("id", id);
  throwIfSupabaseError(error, "Could not remove that date");
}
