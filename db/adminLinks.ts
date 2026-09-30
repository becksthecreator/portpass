import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Admin -> Our tools (29 Sept brief, part 3): the founders' working links.
export type AdminLink = { id: number; title: string; url: string | null; description: string | null; sort: number };

const COLUMNS = "id,title,url,description,sort";

function toLink(row: Record<string, unknown>): AdminLink {
  return { id: Number(row.id), title: row.title as string, url: (row.url as string | null) ?? null, description: (row.description as string | null) ?? null, sort: Number(row.sort ?? 0) };
}

export async function listAdminLinks(): Promise<AdminLink[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("admin_links").select(COLUMNS).order("sort", { ascending: true }).order("id", { ascending: true });
  throwIfSupabaseError(error, "Could not load tools");
  return (data ?? []).map(toLink);
}

export type AdminLinkInput = { title: string; url: string | null; description: string | null; sort: number };

export async function createAdminLink(input: AdminLinkInput): Promise<AdminLink> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("admin_links").insert({ title: input.title, url: input.url, description: input.description, sort: input.sort }).select(COLUMNS).single();
  throwIfSupabaseError(error, "Could not add the tool");
  return toLink(data!);
}

export async function updateAdminLink(id: number, patch: Partial<AdminLinkInput>): Promise<AdminLink | null> {
  const supabase = getSupabaseAdmin();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.url !== undefined) row.url = patch.url;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.sort !== undefined) row.sort = patch.sort;
  const { data, error } = await supabase.from("admin_links").update(row).eq("id", id).select(COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not save the tool");
  return data ? toLink(data) : null;
}

export async function deleteAdminLink(id: number): Promise<AdminLink | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("admin_links").delete().eq("id", id).select(COLUMNS).maybeSingle();
  throwIfSupabaseError(error, "Could not remove the tool");
  return data ? toLink(data) : null;
}
