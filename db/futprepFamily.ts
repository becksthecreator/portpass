import { familyDetails, type FamilyDetails } from "@/lib/futprepFamily";
import { exactEmail } from "./accountBookings";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// "Use my details" (register V4, PR 2): a signed-in parent's earlier Futprep
// registrations, matched to the account's own proven email exactly as the
// account page matches them (db/accountBookings.ts exactEmail). Only the
// columns Privacy v3 names are read; no health, allergy, medication,
// emergency-contact, pickup, notes or payment column is selected (rule 3).
const COLUMNS = "parent_name,parent_phone,relationship,child_name,child_dob,gender,submitted_at";

export async function futprepFamilyFor(email: string | null): Promise<FamilyDetails> {
  if (!email || !email.includes("@") || /[*\s]/.test(email)) return { parent: null, children: [] };
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data, error } = await db
    .from("registrations")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .ilike("parent_email", exactEmail(email))
    .neq("registration_status", "cancelled")
    .order("submitted_at", { ascending: false })
    .limit(30);
  throwIfSupabaseError(error, "Could not read the family's registrations");
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return { parent: null, children: [] };

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return familyDetails(
    rows.map((r) => ({
      parentName: str(r.parent_name),
      parentPhone: str(r.parent_phone),
      relationship: str(r.relationship),
      childName: str(r.child_name),
      childDob: str(r.child_dob) || null,
      gender: str(r.gender),
      submittedAt: str(r.submitted_at),
    })),
  );
}
