import type { StaffRegistration } from "@/db/staff";

// Fields a pending_details registration is still missing. Named for what a
// coach/admin should see, not the underlying column.
//
// Deliberately not in db/staff.ts: that module imports db/supabase.ts,
// which imports "server-only" -- fine for the server components that read
// StaffRegistration, but this function is also called from the client
// component AdminRegistrationManager.tsx, and pulling in the server-only
// chain there breaks the client bundle build. A type-only import of
// StaffRegistration is erased at compile time and carries none of that.
export function missingRegistrationFields(row: StaffRegistration): string[] {
  if (row.registration_status !== "pending_details") return [];
  const missing: string[] = [];
  if (!row.child_dob) missing.push("date of birth");
  if (!row.emergency_contact_name || !row.emergency_contact_phone) missing.push("emergency contact");
  if (row.allergies === null || row.medical_conditions === null || row.medications === null || row.special_needs === null) missing.push("medical information");
  if (!row.photo_consent) missing.push("photo/video consent");
  if (!row.signature_name) missing.push("parent signature");
  return missing;
}
