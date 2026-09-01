import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type ApplicationRecord = {
  id: number;
  organization_name: string;
  contact_person: string;
  email: string;
  phone: string;
  activity_type: string;
  main_location: string;
  player_count: string;
  help_needed: string;
  description: string;
  status: "submitted" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  organization_id?: number | null;
};

export async function createApplication(
  values: Omit<
    ApplicationRecord,
    "id" | "status" | "submitted_at" | "reviewed_at"
  >,
) {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await db.from("applications").insert({
    ...values,
    email: values.email.toLowerCase(),
    status: "submitted",
    submitted_at: now,
  });
  throwIfSupabaseError(error, "Could not create early-access application");
}

export async function listApplications(): Promise<ApplicationRecord[]> {
  const db = getSupabaseAdmin();

  const { data: applications, error } = await db
    .from("applications")
    .select("*")
    .order("submitted_at", { ascending: false });
  throwIfSupabaseError(error, "Could not load early-access applications");

  const rows = (applications ?? []) as ApplicationRecord[];
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const { data: organizations, error: organizationError } = await db
    .from("organizations")
    .select("id,application_id")
    .in("application_id", ids);
  throwIfSupabaseError(
    organizationError,
    "Could not load organizations for applications",
  );

  const organizationByApplication = new Map<number, number>(
    (organizations ?? []).map((row: { id: number; application_id: number }) => [
      row.application_id,
      row.id,
    ]),
  );

  return rows.map((row) => ({
    ...row,
    organization_id: organizationByApplication.get(row.id) ?? null,
  }));
}

export async function reviewApplication(
  id: number,
  decision: "approved" | "rejected",
) {
  const db = getSupabaseAdmin();

  const { data: application, error } = await db
    .from("applications")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load application");

  if (!application) return { found: false };
  if (application.status !== "submitted") {
    return { found: true, changed: false };
  }

  const now = new Date().toISOString();

  if (decision === "approved") {
    const { error: organizationError } = await db.from("organizations").upsert(
      {
        application_id: id,
        name: application.organization_name,
        primary_contact: application.contact_person,
        email: String(application.email).toLowerCase(),
        phone: application.phone,
        activity_type: application.activity_type,
        main_location: application.main_location,
        created_at: now,
      },
      { onConflict: "application_id" },
    );
    throwIfSupabaseError(
      organizationError,
      "Could not create approved organization",
    );
  }

  const { error: updateError } = await db
    .from("applications")
    .update({ status: decision, reviewed_at: now })
    .eq("id", id)
    .eq("status", "submitted");
  throwIfSupabaseError(updateError, "Could not review application");

  return { found: true, changed: true };
}
