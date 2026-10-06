import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Business licence details (round 5, §7). Since brief 25 they are what
// PortPass Market verification checks: never public (absent from every
// public select and the browser roles' column grants), seen only by
// PortPass admins (Admin -> Market, which reads them with the seller list
// in db/marketSellers.ts) and by the business's own owners and admins on its
// shop settings. Callers must have checked that access (lib/auth/guards.ts)
// first. Any change clears the verification (below), and the database then
// sends a verified Market seller back to pending.

export type Licence = {
  type: string;
  number: string | null;
  expiresOn: string | null; // ISO date
  documentUrl: string | null;
};

export type OrganizationLicences = {
  licences: Licence[];
  verifiedAt: string | null;
  verifiedBy: string | null;
};

function toLicence(raw: unknown): Licence | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type.trim() : "";
  if (!type) return null;
  const text = (key: string) => (typeof row[key] === "string" && (row[key] as string).trim() ? (row[key] as string).trim() : null);
  return { type, number: text("number"), expiresOn: text("expires_on"), documentUrl: text("document_url") };
}

function toRow(licence: Licence) {
  return { type: licence.type.trim(), number: licence.number, expires_on: licence.expiresOn, document_url: licence.documentUrl };
}

export async function getOrganizationLicences(organizationId: number): Promise<OrganizationLicences | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("organizations").select("licences,licence_verified_at,licence_verified_by").eq("id", organizationId).maybeSingle();
  throwIfSupabaseError(error, "Could not load licences");
  if (!data) return null;
  const list = Array.isArray(data.licences) ? data.licences : [];
  return {
    licences: list.map(toLicence).filter((l): l is Licence => l !== null),
    verifiedAt: (data.licence_verified_at as string | null) ?? null,
    verifiedBy: (data.licence_verified_by as string | null) ?? null,
  };
}

// Replaces the list. Any change clears the verification: what was checked
// is no longer what is on file.
export async function setOrganizationLicences(organizationId: number, licences: Licence[], actorUserId: string | null): Promise<OrganizationLicences> {
  const cleaned = licences.map(toRow).filter((l) => l.type);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("organizations")
    .update({ licences: cleaned, licence_verified_at: null, licence_verified_by: null })
    .eq("id", organizationId);
  throwIfSupabaseError(error, "Could not save licences");
  await logAudit({ actorUserId, organizationId, action: "organization.licences.updated", targetTable: "organizations", targetId: organizationId, after: { count: cleaned.length, types: cleaned.map((l) => l.type) } });
  return (await getOrganizationLicences(organizationId)) as OrganizationLicences;
}

export async function markOrganizationLicencesVerified(organizationId: number, verifiedByUserId: string): Promise<OrganizationLicences> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("organizations")
    .update({ licence_verified_at: new Date().toISOString(), licence_verified_by: verifiedByUserId })
    .eq("id", organizationId);
  throwIfSupabaseError(error, "Could not mark licences verified");
  await logAudit({ actorUserId: verifiedByUserId, organizationId, action: "organization.licences.verified", targetTable: "organizations", targetId: organizationId });
  return (await getOrganizationLicences(organizationId)) as OrganizationLicences;
}
