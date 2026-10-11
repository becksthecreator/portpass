// What a pending_details registration still lacks, as a coach or admin
// should read it, not the underlying column. Worked out on the server
// (db/staff.ts listFutprepStaffRegistrations) from the registration's
// emergency and health columns, so the desk list that goes to the browser
// carries only these words, never the details (CLAUDE.md rule 3). Pure, so
// it is unit-tested.
export type RegistrationCompleteness = {
  registration_status: string;
  child_dob: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  // null = never asked; "" = asked, and the answer was none.
  allergies: string | null;
  medical_conditions: string | null;
  medications: string | null;
  special_needs: string | null;
  photo_consent: string | null;
  signature_name: string | null;
};

export function missingRegistrationFields(row: RegistrationCompleteness): string[] {
  if (row.registration_status !== "pending_details") return [];
  const missing: string[] = [];
  if (!row.child_dob) missing.push("date of birth");
  if (!row.emergency_contact_name || !row.emergency_contact_phone) missing.push("emergency contact");
  if (row.allergies === null || row.medical_conditions === null || row.medications === null || row.special_needs === null) missing.push("medical information");
  if (!row.photo_consent) missing.push("photo/video consent");
  if (!row.signature_name) missing.push("parent signature");
  return missing;
}
