import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Every organization as the Control Center lists it (28 Sept brief, 1.2).
export type AdminBusiness = {
  id: number;
  slug: string | null;
  name: string;
  section: string | null;
  subcategory: string | null;
  status: string;
  isPublished: boolean;
  createdByAdmin: boolean;
  claimedAt: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
};

export async function listAdminBusinesses(filter: { status?: string | null; section?: string | null } = {}): Promise<AdminBusiness[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("organizations")
    .select("id,slug,name,primary_category,subcategory,status,is_published,created_by_admin,claimed_at,created_at,submitted_at,approved_at")
    // The demo business is not a business to approve, publish or bill.
    .eq("is_demo", false)
    .order("created_at", { ascending: false });
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.section) query = query.eq("primary_category", filter.section);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Could not load businesses");
  return (data ?? []).map((row) => ({
    id: Number(row.id),
    slug: (row.slug as string | null) ?? null,
    name: row.name as string,
    section: (row.primary_category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    status: row.status as string,
    isPublished: Boolean(row.is_published),
    createdByAdmin: Boolean(row.created_by_admin),
    claimedAt: (row.claimed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    submittedAt: (row.submitted_at as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
  }));
}
