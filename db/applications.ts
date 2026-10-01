import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type ApplicationRecord = {
  id: number;
  organization_name: string;
  contact_person: string;
  // Optional since the WhatsApp-first form (27 Sept); older rows have them.
  email: string | null;
  phone: string | null;
  activity_type: string | null;
  main_location: string | null;
  player_count: string | null;
  help_needed: string | null;
  description: string | null;
  section: string | null;
  whatsapp_e164: string | null;
  instagram_handle: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  // The plan picked on /pricing before /apply (pricing brief, 28 Sept).
  plan_code?: string | null;
  status: "submitted" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  organization_id?: number | null;
};

export type NewApplication = {
  organizationName: string;
  contactPerson: string;
  section: string;
  whatsappE164: string;
  instagramHandle: string | null;
  note: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  planCode: string | null;
  // "Referred by a business already on PortPass" (brief 14).
  referralCode?: string | null;
};

export async function createApplication(values: NewApplication): Promise<{ id: number }> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("applications")
    .insert({
      organization_name: values.organizationName,
      contact_person: values.contactPerson,
      section: values.section,
      whatsapp_e164: values.whatsappE164,
      // Kept in the legacy column too so the admin list and any old export
      // keep showing a number without a code change.
      phone: values.whatsappE164,
      instagram_handle: values.instagramHandle,
      description: values.note,
      utm_source: values.utmSource,
      utm_medium: values.utmMedium,
      utm_campaign: values.utmCampaign,
      plan_code: values.planCode,
      referral_code: values.referralCode ?? null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  throwIfSupabaseError(error, "Could not create listing application");
  if (!data) throw new Error("Could not create listing application");
  return { id: Number(data.id) };
}

export async function listApplications(): Promise<ApplicationRecord[]> {
  const db = getSupabaseAdmin();

  const { data: applications, error } = await db
    .from("applications")
    .select("*")
    .order("submitted_at", { ascending: false });
  throwIfSupabaseError(error, "Could not load listing applications");

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
    const app = application as ApplicationRecord;
    const { error: organizationError } = await db.from("organizations").upsert(
      {
        application_id: id,
        name: app.organization_name,
        primary_contact: app.contact_person,
        email: app.email ? app.email.toLowerCase() : null,
        phone: app.phone ?? app.whatsapp_e164,
        activity_type: app.activity_type ?? app.section,
        main_location: app.main_location,
        primary_category: app.section,
        // Approving an application is PortPass approving the business, so
        // it can appear as Coming Soon on its category page right away.
        status: "approved",
        approved_at: now,
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
