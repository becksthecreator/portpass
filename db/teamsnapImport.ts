// One-off TeamSnap roster import (brief 13, part 5). Fills in the parent,
// emergency and date-of-birth details of registrations still waiting on
// them (pending_details), matched by child name. Medical fields only when
// TeamSnap has them. Consent stays unset: the parent still confirms through
// their completion link. Nothing is ever sent to a parent from here.
import { describeFill, parseCsv, planImport, toRecords, type ExistingRegistration, type PlanRow, type RegistrationColumn } from "@/lib/teamsnapImport";
import { logAudit } from "./audit";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

const MAX_CSV_CHARS = 1_000_000;
const MAX_ROWS = 1000;

const COLUMNS = "id,reference_code,child_name,registration_status,child_dob,gender,parent_name,parent_email,parent_phone,relationship,emergency_contact_name,emergency_contact_phone,authorized_pickup,allergies,medical_conditions,medications,special_needs";

async function loadRegistrations(programId: number, termId: number): Promise<ExistingRegistration[]> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data, error } = await db
    .from("registrations")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .eq("program_id", programId)
    .eq("term_id", termId)
    .in("registration_status", ["pending_details", "pending", "confirmed"]);
  throwIfSupabaseError(error, "Could not load the class's registrations");
  return (data ?? []).map((row) => {
    const current: Partial<Record<RegistrationColumn, string | null>> = {};
    for (const column of ["child_dob", "gender", "parent_name", "parent_email", "parent_phone", "relationship", "emergency_contact_name", "emergency_contact_phone", "authorized_pickup", "allergies", "medical_conditions", "medications", "special_needs"] as RegistrationColumn[]) {
      const value = (row as Record<string, unknown>)[column];
      current[column] = value === null || value === undefined ? null : String(value);
    }
    return { id: Number(row.id), referenceCode: String(row.reference_code), childName: String(row.child_name), status: String(row.registration_status), current };
  });
}

function planFor(csv: string, registrations: ExistingRegistration[]) {
  if (csv.length > MAX_CSV_CHARS) throw new Error("CSV_TOO_LARGE");
  const { records, mapped, unmapped } = toRecords(parseCsv(csv));
  if (records.length > MAX_ROWS) throw new Error("CSV_TOO_LARGE");
  if (!mapped.includes("childName") && !(mapped.includes("childFirst") && mapped.includes("childLast"))) throw new Error("NO_CHILD_NAME_COLUMN");
  return { plan: planImport(records, registrations), mapped, unmapped };
}

export type ImportPreviewRow = {
  row: number;
  childName: string;
  status: PlanRow["status"];
  referenceCode: string | null;
  // Field names only; medical as a count, never its content.
  fields: string[];
};

export type ImportPreview = {
  mapped: string[];
  unmapped: string[];
  rows: ImportPreviewRow[];
  counts: Record<PlanRow["status"], number>;
};

function summarize(plan: PlanRow[]): ImportPreview["counts"] {
  const counts = { fill: 0, nothing_new: 0, no_match: 0, ambiguous: 0, not_pending: 0 };
  for (const row of plan) counts[row.status] += 1;
  return counts;
}

export async function previewTeamsnapImport(input: { programId: number; termId: number; csv: string }): Promise<ImportPreview> {
  const { plan, mapped, unmapped } = planFor(input.csv, await loadRegistrations(input.programId, input.termId));
  return {
    mapped,
    unmapped,
    rows: plan.map((row) => ({ row: row.row, childName: row.childName, status: row.status, referenceCode: row.referenceCode, fields: describeFill(row.fill) })),
    counts: summarize(plan),
  };
}

// Writes only the planned fields, only to registrations still waiting on
// details, and logs the import (counts and ids; no personal data).
export async function applyTeamsnapImport(input: { programId: number; termId: number; csv: string; actor: string }): Promise<{ updated: number; counts: ImportPreview["counts"] }> {
  const { plan } = planFor(input.csv, await loadRegistrations(input.programId, input.termId));
  const db = getSupabaseAdmin();
  const updatedIds: number[] = [];
  for (const row of plan) {
    if (row.status !== "fill" || !row.registrationId) continue;
    const { data, error } = await db
      .from("registrations")
      .update(row.fill)
      .eq("id", row.registrationId)
      .eq("registration_status", "pending_details")
      .select("id");
    throwIfSupabaseError(error, "Could not save the imported details");
    if ((data ?? []).length) updatedIds.push(row.registrationId);
  }
  const counts = summarize(plan);
  await logAudit({
    organizationId: await futprepOrganizationId(),
    action: "futprep.teamsnap_import",
    targetTable: "registrations",
    targetId: `${input.programId}:${input.termId}`,
    after: { programId: input.programId, termId: input.termId, rows: plan.length, counts, updated: updatedIds.length, registrationIds: updatedIds, by: input.actor },
  });
  return { updated: updatedIds.length, counts };
}
