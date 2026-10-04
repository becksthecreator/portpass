import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import type { BusinessProof } from "@/lib/businessProof";

// The one proof line on /business (brief 18, A7), read from the database
// every time the page is built so it is never a made-up number: how many
// children are registered with a live business, and whether their
// payments are recorded on PortPass. Counts only: no names, no contact
// details, nothing about any child.

export async function getBusinessProof(slug = "futprep"): Promise<BusinessProof | null> {
  const db = getSupabaseAdmin();
  const { data: org, error: orgError } = await db.from("organizations").select("id,name").eq("slug", slug).eq("is_published", true).maybeSingle();
  throwIfSupabaseError(orgError, "Could not load the business for the proof line");
  if (!org) return null;
  // Children, not registrations: a child in a term and a camp counts once.
  const children = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("registrations").select("id,child_person_id").eq("organization_id", org.id).neq("registration_status", "cancelled").order("id", { ascending: true }).range(from, from + 999);
    throwIfSupabaseError(error, "Could not count registrations for the proof line");
    for (const row of data ?? []) children.add(row.child_person_id ? `p${row.child_person_id}` : `r${row.id}`);
    if ((data ?? []).length < 1000) break;
  }
  const registered = children.size;
  if (registered === 0) return null;
  const payments = await db.from("payments").select("id,registrations!inner(organization_id)", { count: "exact", head: true }).eq("registrations.organization_id", org.id);
  throwIfSupabaseError(payments.error, "Could not count payments for the proof line");
  return { name: String(org.name), registered, paymentsRecorded: payments.count ?? 0 };
}

