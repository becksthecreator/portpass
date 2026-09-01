import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const applications = sqliteTable(
  "applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationName: text("organization_name").notNull(),
    contactPerson: text("contact_person").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    activityType: text("activity_type").notNull(),
    mainLocation: text("main_location").notNull(),
    playerCount: text("player_count").notNull(),
    helpNeeded: text("help_needed").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("submitted"),
    submittedAt: text("submitted_at").notNull(),
    reviewedAt: text("reviewed_at"),
  },
  (table) => [index("applications_status_idx").on(table.status)]
);

export const organizations = sqliteTable("organizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id")
    .notNull()
    .unique()
    .references(() => applications.id),
  name: text("name").notNull(),
  primaryContact: text("primary_contact").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  activityType: text("activity_type").notNull(),
  mainLocation: text("main_location").notNull(),
  createdAt: text("created_at").notNull(),
});

export const programs = sqliteTable("programs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").references(() => organizations.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ageMin: integer("age_min").notNull(),
  ageMax: integer("age_max").notNull(),
  coed: integer("coed").notNull().default(1),
  location: text("location").notNull(),
  dayOfWeek: text("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  capacity: integer("capacity").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const programTerms = sqliteTable("program_terms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id").notNull().references(() => programs.id),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  breakDates: text("break_dates").notNull(),
  weeklyFeeCents: integer("weekly_fee_cents").notNull(),
  termFeeCents: integer("term_fee_cents").notNull(),
  registrationFeeCents: integer("registration_fee_cents").notNull().default(0),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const registrations = sqliteTable(
  "registrations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referenceCode: text("reference_code").notNull().unique(),
    organizationId: integer("organization_id").references(() => organizations.id),
    programId: integer("program_id").notNull().references(() => programs.id),
    termId: integer("term_id").notNull().references(() => programTerms.id),
    parentName: text("parent_name").notNull(),
    parentEmail: text("parent_email").notNull(),
    parentPhone: text("parent_phone").notNull(),
    relationship: text("relationship").notNull(),
    childName: text("child_name").notNull(),
    childDob: text("child_dob").notNull(),
    gender: text("gender").notNull(),
    emergencyContactName: text("emergency_contact_name").notNull(),
    emergencyContactPhone: text("emergency_contact_phone").notNull(),
    allergies: text("allergies").notNull().default(""),
    medicalConditions: text("medical_conditions").notNull().default(""),
    medications: text("medications").notNull().default(""),
    specialNeeds: text("special_needs").notNull().default(""),
    authorizedPickup: text("authorized_pickup").notNull(),
    additionalNotes: text("additional_notes").notNull().default(""),
    photoConsent: text("photo_consent").notNull(),
    paymentFrequency: text("payment_frequency").notNull(),
    paymentMethod: text("payment_method").notNull(),
    amountDueCents: integer("amount_due_cents").notNull(),
    registrationStatus: text("registration_status").notNull().default("pending"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    consentVersion: text("consent_version").notNull(),
    consentAccepted: integer("consent_accepted").notNull(),
    consentAt: text("consent_at").notNull(),
    signatureName: text("signature_name").notNull(),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("registrations_program_term_idx").on(table.programId, table.termId),
    index("registrations_parent_email_idx").on(table.parentEmail),
  ]
);

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
  mapLabel: text("map_label"),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const staffMembers = sqliteTable("staff_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  organizationId: integer("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  email: text("email"),
  responsibilities: text("responsibilities").notNull().default(""),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  programId: integer("program_id").notNull().references(() => programs.id),
  termId: integer("term_id").notNull().references(() => programTerms.id),
  sessionDate: text("session_date").notNull(),
  startTime: text("start_time").notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("scheduled"),
  createdAt: text("created_at").notNull(),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  registrationId: integer("registration_id").notNull().references(() => registrations.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("received"),
  recordedBy: text("recorded_by"),
  note: text("note").notNull().default(""),
  receivedAt: text("received_at"),
  createdAt: text("created_at").notNull(),
});
