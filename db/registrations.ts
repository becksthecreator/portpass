import { createHash, randomBytes } from "node:crypto";
import {
  CONSENT_VERSION,
  FUTPREP_PROGRAMS,
  FUTPREP_TERM,
} from "@/app/futprep/config";
import { EMPTY_ATTRIBUTION, resolveAttribution, type Attribution, type HeardAnswer, type Resolved } from "@/lib/attribution";
import { amountDueCents as amountDueFor, isTermEarlyAccessOpen, isTermOpen, nassauToday, prorateCents, type ProgramType, type TermWindow } from "@/lib/futprepTerms";
import { ageLabel, effectiveCap, fitsAgeRule } from "@/lib/futprepClasses";
import { generateWeeklySessionDates } from "@/lib/scheduling";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type RegistrationStatus = "pending_details" | "pending" | "confirmed" | "cancelled" | "waitlist" | "trial";
// Statuses that occupy a class spot -- everything except cancelled. A
// pending_details row is a real, physically-attending child, so it must
// count the same as pending/confirmed everywhere capacity is checked.
const ACTIVE_REGISTRATION_STATUSES: RegistrationStatus[] = ["pending_details", "pending", "confirmed"];

// Growth tracking (28 Sept): a family is "known" when the parent's phone
// or email appears on any earlier registration of the same organization
// -- siblings included, cancelled included. Counted, never listed.
async function countFamilyMatches(db: ReturnType<typeof getSupabaseAdmin>, organizationId: number, column: "parent_phone" | "parent_email", value: string | null): Promise<number> {
  if (!value) return 0;
  const { count, error } = await db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq(column, value)
    // A free trial or a waitlist entry doesn't make a family "returning".
    .not("registration_status", "in", "(trial,waitlist)");
  throwIfSupabaseError(error, "Could not check family history");
  return Number(count ?? 0);
}
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue" | "waived";
export type PaymentFrequency = "weekly" | "term";
export type PaymentMethod = "cash" | "bank_transfer" | "online_banking";

export type FutprepRegistrationInput = {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  relationship: string;
  childName: string;
  childDob: string;
  gender: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string;
  medicalConditions: string;
  medications: string;
  specialNeeds: string;
  authorizedPickup: string;
  additionalNotes: string;
  programSlug: string;
  // The term being registered for (brief 06 v2, A1.4). Optional only for
  // callers that predate it: a program with exactly one open term uses that.
  termId?: number | null;
  paymentFrequency: PaymentFrequency;
  paymentMethod: PaymentMethod;
  photoConsent: "yes" | "no";
  consentAccepted: boolean;
  signatureName: string;
  // Staff fast-add only (see /staff/registrations): who entered it, and
  // whether they've confirmed a child's age against the class boundary is
  // right despite ageOnDate() disagreeing - real enrolled kids shouldn't be
  // blockable by a DOB mis-key mid-migration the way a parent's own
  // self-service submission should be.
  enteredByStaff?: string;
  ageOverrideConfirmed?: boolean;
  // Growth tracking (28 Sept): the parent's answer to "How did you hear
  // about Futprep?", an optional referral code, and what the first-party
  // cookie / URL said. The server computes is_new_family and
  // commission_eligible from these; the form never does.
  heardAboutUs?: HeardAnswer | null;
  referralCode?: string | null;
  attribution?: Attribution;
  // Part C (brief 06 v2). "waitlist": register, or join the waitlist if
  // the class is full. "trial": a free first Saturday for a signed-in
  // parent. A return token opens early access; a trial code prorates a
  // "join the rest of the term" registration.
  mode?: "standard" | "waitlist" | "trial";
  returnToken?: string | null;
  trialSessionId?: number | null;
  joinFromTrialCode?: string | null;
  signedInUserId?: string | null;
};

// One registrable thing: a program in one open term (brief 06 v2, Part A).
// A class with Term 1 and Term 2 both open is two offers; a camp is one.
export type FutprepAvailability = {
  programId: number;
  termId: number;
  slug: string;
  name: string;
  programType: ProgramType;
  isPublic: boolean;
  ageMin: number;
  ageMax: number;
  // Brief 12: ages in months win when set; ageLabel is how Futprep writes
  // the range ("1½–3").
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  ageLabel: string;
  day: string;
  time: string;
  endTime: string;
  location: string;
  locationNote: string | null;
  capacity: number;
  // min(capacity, coaches on duty at the next session × children per coach).
  effectiveCap: number;
  weeklyFeeCents: number;
  termFeeCents: number;
  termName: string;
  termStartDate: string;
  termEndDate: string;
  breakDates: string[];
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  whatToBring: string | null;
  registrationClosesAt: string | null;
  // Part C: open only through a returning family's early-access link.
  earlyAccessOnly: boolean;
  // The free taster Saturday (brief 12), or #97's in-term trial dates.
  tasterDate: string | null;
  trialDates: string[];
  trialSpotsPerSession: number;
  registered: number;
  spotsRemaining: number;
};

let lastSeedAt = 0;
let seedPromise: Promise<void> | null = null;

// For the integration test that proves the seed never re-activates a term
// staff switched off: the 60-second throttle would otherwise hide a second
// call in the same process.
export function resetFutprepSeedThrottleForTests() {
  lastSeedAt = 0;
}

// The seed exists only to bootstrap an empty database (a fresh local stack
// in CI). Once any of the configured programs exists -- active or not --
// it is never touched again: Term 2, camps and deactivations made in the
// database are the truth from then on (brief 06 v2, A1.1).
async function isFutprepAlreadySeeded(): Promise<boolean> {
  const db = getSupabaseAdmin();
  const slugs = FUTPREP_PROGRAMS.map((program) => program.slug);
  const { count, error } = await db
    .from("programs")
    .select("id", { count: "exact", head: true })
    .in("slug", slugs);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function ensureFutprepPilotData() {
  if (Date.now() - lastSeedAt < 60_000) return;
  if (await isFutprepAlreadySeeded()) {
    lastSeedAt = Date.now();
    return;
  }
  if (!seedPromise) {
    seedPromise = seedFutprepPilot().finally(() => {
      seedPromise = null;
    });
  }
  await seedPromise;
  lastSeedAt = Date.now();
}

// Insert-if-missing only: a program that already exists (by slug) is left
// exactly as it is, including its terms and whether they are active.
async function seedFutprepPilot() {
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: organizations, error: organizationError } = await db
    .from("organizations")
    .select("id,name")
    .or("name.ilike.%futprep%,name.ilike.%footprep%")
    .order("id", { ascending: true })
    .limit(1);
  throwIfSupabaseError(organizationError, "Could not locate Futprep organization");

  const organization = (organizations?.[0] ?? null) as { id: number; name: string } | null;

  if (organization) {
    const { error: locationError } = await db.from("locations").upsert(
      {
        organization_id: organization.id,
        name: FUTPREP_TERM.location,
        address: "Lyford Cay Lower Campus, New Providence, The Bahamas",
        map_label: "Lyford Cay Lower Campus Soccer Field",
        active: true,
        created_at: now,
      },
      { onConflict: "organization_id,name", ignoreDuplicates: true },
    );
    throwIfSupabaseError(locationError, "Could not seed Futprep location");
  }

  for (const configured of FUTPREP_PROGRAMS) {
    const { data: existingProgram, error: existingError } = await db
      .from("programs")
      .select("id")
      .eq("slug", configured.slug)
      .maybeSingle();
    throwIfSupabaseError(existingError, "Could not load Futprep program");
    if (existingProgram) continue;

    const { data: storedProgram, error: programError } = await db
      .from("programs")
      .insert({
        organization_id: organization?.id ?? null,
        slug: configured.slug,
        name: configured.name,
        age_min: configured.ageMin,
        age_max: configured.ageMax,
        age_min_months: configured.ageMinMonths ?? null,
        age_max_months: configured.ageMaxMonths ?? null,
        coed: true,
        location: FUTPREP_TERM.location,
        day_of_week: configured.day,
        start_time: configured.time,
        end_time: configured.endTime,
        capacity: configured.capacity,
        active: true,
        created_at: now,
      })
      .select("id")
      .single();
    throwIfSupabaseError(programError, "Could not seed Futprep program");
    if (!storedProgram) throw new Error("Could not seed Futprep program");
    const programId = Number(storedProgram.id);

    const { data: term, error: termError } = await db
      .from("program_terms")
      .insert({
        program_id: programId,
        name: FUTPREP_TERM.name,
        start_date: FUTPREP_TERM.startDate,
        end_date: FUTPREP_TERM.endDate,
        break_dates: FUTPREP_TERM.breakDates,
        weekly_fee_cents: configured.weeklyFeeCents,
        term_fee_cents: configured.termFeeCents,
        registration_fee_cents: 0,
        active: true,
        created_at: now,
      })
      .select("id")
      .single();
    throwIfSupabaseError(termError, "Could not seed Futprep term");
    if (!term) throw new Error("Could not seed Futprep term");

    const sessions = generateWeeklySessionDates({
      startDate: FUTPREP_TERM.startDate,
      endDate: FUTPREP_TERM.endDate,
      dayOfWeek: configured.day,
      breakDates: FUTPREP_TERM.breakDates,
    }).map((sessionDate) => ({
      program_id: programId,
      term_id: Number(term.id),
      session_date: sessionDate,
      start_time: configured.time,
      location: FUTPREP_TERM.location,
      status: "scheduled",
      created_at: now,
    }));
    if (sessions.length) {
      const { error: sessionError } = await db
        .from("sessions")
        .upsert(sessions, { onConflict: "program_id,term_id,session_date", ignoreDuplicates: true });
      throwIfSupabaseError(sessionError, "Could not seed Futprep sessions");
    }
  }
}

const PROGRAM_OFFER_COLUMNS = "id,slug,name,program_type,is_public,age_min,age_max,age_min_months,age_max_months,location,location_note,day_of_week,start_time,end_time,capacity,children_per_coach,default_coaches,organization_id";
const TERM_OFFER_COLUMNS = "id,program_id,name,start_date,end_date,break_dates,weekly_fee_cents,term_fee_cents,active,registration_opens_at,registration_closes_at,daily_start_time,daily_end_time,what_to_bring,early_access_until,trial_dates,trial_spots_per_session,taster_date";

type ProgramOfferRow = {
  id: number; slug: string; name: string; program_type: string; is_public: boolean; age_min: number; age_max: number;
  location: string; day_of_week: string; start_time: string; end_time: string | null; capacity: number; organization_id: number | null;
  age_min_months: number | null; age_max_months: number | null; location_note: string | null;
  children_per_coach: number | null; default_coaches: number | null;
};
type TermOfferRow = {
  id: number; program_id: number; name: string; start_date: string; end_date: string; break_dates: string[] | null;
  weekly_fee_cents: number; term_fee_cents: number; active: boolean; registration_opens_at: string | null; registration_closes_at: string | null;
  daily_start_time: string | null; daily_end_time: string | null; what_to_bring: string | null;
  early_access_until: string | null; trial_dates: string[] | null; trial_spots_per_session: number | null;
  taster_date: string | null;
};

// ---- Effective caps (brief 12) ----------------------------------------------
// A class is capped by the coaches on duty at its next session:
// min(capacity, coaches × children per coach). The next session is the
// first one from today inside the term's own dates (the pre-term taster
// Saturday doesn't count); none left means the program's default coaches.
type UpcomingSession = { term_id: number; session_date: string; coaches_on_duty: number | null };

async function loadUpcomingSessions(db: ReturnType<typeof getSupabaseAdmin>, termIds: number[], today: string): Promise<UpcomingSession[]> {
  if (termIds.length === 0) return [];
  const { data, error } = await db
    .from("sessions")
    .select("term_id,session_date,coaches_on_duty")
    .in("term_id", termIds)
    .gte("session_date", today)
    .neq("status", "cancelled")
    .order("session_date", { ascending: true });
  throwIfSupabaseError(error, "Could not load upcoming sessions");
  return (data ?? []) as UpcomingSession[];
}

function capForTerm(
  program: { capacity: number; children_per_coach: number | null; default_coaches: number | null },
  term: { id: number; start_date: string; taster_date?: string | null },
  upcoming: UpcomingSession[],
): number {
  const next = upcoming.find((s) => Number(s.term_id) === Number(term.id) && s.session_date >= term.start_date && s.session_date !== term.taster_date);
  return effectiveCap({
    capacity: Number(program.capacity),
    childrenPerCoach: program.children_per_coach === null || program.children_per_coach === undefined ? null : Number(program.children_per_coach),
    coachesOnDuty: next?.coaches_on_duty ?? null,
    defaultCoaches: Number(program.default_coaches ?? 1),
  });
}

function ageRuleOf(program: { age_min: number; age_max: number; age_min_months?: number | null; age_max_months?: number | null }) {
  return {
    ageMin: Number(program.age_min),
    ageMax: Number(program.age_max),
    ageMinMonths: program.age_min_months === null || program.age_min_months === undefined ? null : Number(program.age_min_months),
    ageMaxMonths: program.age_max_months === null || program.age_max_months === undefined ? null : Number(program.age_max_months),
  };
}

function termWindow(term: TermOfferRow): TermWindow {
  return { active: Boolean(term.active), endDate: term.end_date, registrationOpensAt: term.registration_opens_at, registrationClosesAt: term.registration_closes_at };
}

// Every open offer for Futprep: each active program (public ones only,
// unless asked) with each of its active terms whose registration window
// is open. Three queries however many programs and terms there are.
export async function listFutprepOffers(options: { publicOnly?: boolean; now?: Date; earlyAccess?: boolean } = {}): Promise<FutprepAvailability[]> {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const now = options.now ?? new Date();

  let programQuery = db
    .from("programs")
    .select(PROGRAM_OFFER_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("id", { ascending: true });
  if (options.publicOnly) programQuery = programQuery.eq("is_public", true);
  // A school contract (brief 13) is never registrable, even by direct link.
  programQuery = programQuery.neq("program_type", "contract");
  const { data: programs, error: programsError } = await programQuery;
  throwIfSupabaseError(programsError, "Could not load class availability");

  const programList = (programs ?? []) as ProgramOfferRow[];
  if (programList.length === 0) return [];
  const programIds = programList.map((program) => program.id);

  const [{ data: terms, error: termsError }, { data: activeRegistrations, error: registrationsError }] = await Promise.all([
    db.from("program_terms").select(TERM_OFFER_COLUMNS).in("program_id", programIds).eq("active", true).order("start_date", { ascending: true }),
    db.from("registrations").select("program_id,term_id").in("program_id", programIds).in("registration_status", ACTIVE_REGISTRATION_STATUSES),
  ]);
  throwIfSupabaseError(termsError, "Could not load term availability");
  throwIfSupabaseError(registrationsError, "Could not count registrations");

  const upcoming = await loadUpcomingSessions(db, ((terms ?? []) as TermOfferRow[]).map((t) => Number(t.id)), nassauToday(now));

  const registeredByKey = new Map<string, number>();
  for (const row of activeRegistrations ?? []) {
    const key = `${row.program_id}:${row.term_id}`;
    registeredByKey.set(key, (registeredByKey.get(key) ?? 0) + 1);
  }

  const programById = new Map(programList.map((program) => [program.id, program]));
  const offers: FutprepAvailability[] = [];
  for (const term of (terms ?? []) as TermOfferRow[]) {
    const program = programById.get(Number(term.program_id));
    if (!program) continue;
    const publicOpen = isTermOpen(termWindow(term), now);
    const earlyOpen = Boolean(options.earlyAccess) && isTermEarlyAccessOpen({ ...termWindow(term), earlyAccessUntil: term.early_access_until }, now);
    if (!publicOpen && !earlyOpen) continue;
    const capacity = Number(program.capacity);
    const cap = capForTerm(program, term, upcoming);
    const registered = registeredByKey.get(`${program.id}:${term.id}`) ?? 0;
    const rule = ageRuleOf(program);
    offers.push({
      programId: Number(program.id),
      termId: Number(term.id),
      slug: program.slug,
      name: program.name,
      programType: program.program_type === "camp" ? "camp" : "term",
      isPublic: Boolean(program.is_public),
      ageMin: Number(program.age_min),
      ageMax: Number(program.age_max),
      ageMinMonths: rule.ageMinMonths,
      ageMaxMonths: rule.ageMaxMonths,
      ageLabel: ageLabel(rule),
      day: program.day_of_week,
      time: program.start_time,
      endTime: program.end_time ?? program.start_time,
      location: program.location,
      locationNote: program.location_note ?? null,
      capacity,
      effectiveCap: cap,
      weeklyFeeCents: Number(term.weekly_fee_cents),
      termFeeCents: Number(term.term_fee_cents),
      termName: term.name,
      termStartDate: term.start_date,
      termEndDate: term.end_date,
      breakDates: (term.break_dates ?? []) as string[],
      dailyStartTime: term.daily_start_time,
      dailyEndTime: term.daily_end_time,
      whatToBring: term.what_to_bring,
      registrationClosesAt: term.registration_closes_at,
      earlyAccessOnly: !publicOpen,
      tasterDate: term.taster_date ?? null,
      trialDates: term.taster_date ? [term.taster_date] : ((term.trial_dates ?? []) as string[]),
      trialSpotsPerSession: Number(term.trial_spots_per_session ?? 0),
      registered,
      spotsRemaining: Math.max(0, cap - registered),
    });
  }
  // Term classes first (by program), then camps by start date.
  return offers.sort((a, b) =>
    a.programType === b.programType
      ? a.programType === "camp"
        ? a.termStartDate.localeCompare(b.termStartDate)
        : a.programId - b.programId || a.termStartDate.localeCompare(b.termStartDate)
      : a.programType === "term" ? -1 : 1,
  );
}

// What the public sees: every open offer on a listed (is_public) program.
export async function getFutprepAvailability(): Promise<FutprepAvailability[]> {
  return listFutprepOffers({ publicOnly: true });
}

// One offer by program slug (and term, when given), including unlisted
// programs -- a direct /futprep/register?program=&term= link works for a
// program that is not on the public list.
export async function getFutprepOffer(programSlug: string, termId?: number | null, options: { earlyAccess?: boolean } = {}): Promise<FutprepAvailability | null> {
  const offers = (await listFutprepOffers({ earlyAccess: options.earlyAccess })).filter((offer) => offer.slug === programSlug);
  if (termId) return offers.find((offer) => offer.termId === termId) ?? null;
  return offers.length === 1 ? offers[0] : null;
}

export type FutprepRegistrationStatus = {
  referenceCode: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  relationship: string;
  program: { name: string; day: string; time: string; endTime: string; location: string };
  paymentFrequency: PaymentFrequency;
  paymentMethod: PaymentMethod;
  amountDueCents: number;
  paidCents: number;
  paymentStatus: PaymentStatus;
  registrationStatus: RegistrationStatus;
  remainingSessionDates: string[];
};

// Parent self-service lookup. Deliberately returns only the fields above —
// never medical, allergy, medication, special-needs, or emergency-contact
// data, which stay behind staff auth. The reference code alone is not
// enough to see this: the child's date of birth must match too, so a
// leaked or guessed code can't be used to pull up a registration.
export async function getFutprepRegistrationStatus(
  referenceCode: string,
  childDob: string,
): Promise<FutprepRegistrationStatus | null> {
  const db = getSupabaseAdmin();

  const { data: registration, error } = await db
    .from("registrations")
    .select("id,reference_code,child_name,child_dob,program_id,term_id,payment_frequency,payment_method,amount_due_cents,payment_status,registration_status,parent_name,parent_email,parent_phone,relationship")
    .ilike("reference_code", referenceCode.trim())
    .maybeSingle();
  throwIfSupabaseError(error, "Could not look up registration");
  if (!registration || registration.child_dob !== childDob) return null;

  const { data: program, error: programError } = await db
    .from("programs")
    .select("name,day_of_week,start_time,end_time,location")
    .eq("id", registration.program_id)
    .maybeSingle();
  throwIfSupabaseError(programError, "Could not load registration program");

  const [{ data: payments, error: paymentsError }, { data: sessions, error: sessionsError }] =
    await Promise.all([
      db.from("payments").select("amount_cents").eq("registration_id", registration.id).eq("status", "received"),
      db
        .from("sessions")
        .select("session_date")
        .eq("program_id", registration.program_id)
        .eq("term_id", registration.term_id)
        .neq("status", "cancelled")
        .gte("session_date", new Date().toISOString().slice(0, 10))
        .order("session_date", { ascending: true }),
    ]);
  throwIfSupabaseError(paymentsError, "Could not load registration payments");
  throwIfSupabaseError(sessionsError, "Could not load registration sessions");

  const paidCents = (payments ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);

  return {
    referenceCode: registration.reference_code,
    childName: registration.child_name,
    parentName: registration.parent_name,
    parentEmail: registration.parent_email,
    parentPhone: registration.parent_phone,
    relationship: registration.relationship,
    program: {
      name: program?.name ?? "",
      day: program?.day_of_week ?? "",
      time: program?.start_time ?? "",
      endTime: program?.end_time ?? program?.start_time ?? "",
      location: program?.location ?? "",
    },
    paymentFrequency: registration.payment_frequency as PaymentFrequency,
    paymentMethod: registration.payment_method as PaymentMethod,
    amountDueCents: Number(registration.amount_due_cents),
    paidCents,
    paymentStatus: registration.payment_status as PaymentStatus,
    registrationStatus: registration.registration_status as RegistrationStatus,
    remainingSessionDates: (sessions ?? []).map((row) => row.session_date as string),
  };
}

export async function createFutprepRegistration(
  input: FutprepRegistrationInput,
) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: program, error: programError } = await db
    .from("programs")
    .select("id,organization_id,capacity,name,age_min,age_max,age_min_months,age_max_months,children_per_coach,default_coaches,location,day_of_week,start_time,end_time,program_type")
    .eq("slug", input.programSlug)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(programError, "Could not load selected program");
  if (!program) throw new Error("INVALID_PROGRAM");
  // Brief 13: the school holds a contract child's details; there is no
  // registration for one.
  if (program.program_type === "contract") throw new Error("INVALID_PROGRAM");
  const programType: ProgramType = program.program_type === "camp" ? "camp" : "term";

  // The term must belong to this program and be taking registrations
  // (active, not finished, inside its window). Staff entering a child by
  // hand may use an active term whose public window has closed.
  const { data: terms, error: termError } = await db
    .from("program_terms")
    .select("id,program_id,name,start_date,end_date,break_dates,weekly_fee_cents,term_fee_cents,active,registration_opens_at,registration_closes_at,daily_start_time,daily_end_time,early_access_until,trial_dates,trial_spots_per_session,taster_date")
    .eq("program_id", program.id)
    .eq("active", true)
    .order("start_date", { ascending: true });
  throwIfSupabaseError(termError, "Could not load selected term");
  // A returning family's early-access link opens a term before its public
  // opening, until early_access_until (Part C).
  const returnLink = input.returnToken ? await findReturnLink(input.returnToken) : null;
  if (input.returnToken && !returnLink) throw new Error("RETURN_LINK_INVALID");
  const usable = (terms ?? []).filter((row) => {
    if (input.enteredByStaff) return true;
    const window = { active: Boolean(row.active), endDate: row.end_date, registrationOpensAt: row.registration_opens_at, registrationClosesAt: row.registration_closes_at };
    return isTermOpen(window) || (returnLink !== null && isTermEarlyAccessOpen({ ...window, earlyAccessUntil: row.early_access_until }));
  });
  const term = input.termId
    ? usable.find((row) => Number(row.id) === Number(input.termId)) ?? null
    : usable.length === 1 ? usable[0] : null;
  if (!term) {
    const requested = input.termId ? (terms ?? []).find((row) => Number(row.id) === Number(input.termId)) : null;
    throw new Error(requested ? "TERM_CLOSED" : "PROGRAM_NOT_AVAILABLE");
  }

  // Brief 12: in months at the term's start (Lil Kickers from 18 months).
  if (!fitsAgeRule(input.childDob, term.start_date, ageRuleOf(program))) {
    if (!input.enteredByStaff || !input.ageOverrideConfirmed) {
      throw new Error("AGE_MISMATCH");
    }
  }

  const mode = input.mode ?? "standard";
  let registrationStatus: RegistrationStatus = "pending";
  let trialSessionId: number | null = null;
  let joinedFrom: { id: number; amountCents: number } | null = null;

  if (mode === "trial") {
    // First Saturday free with a PortPass account: signed in, a real
    // session on one of the term's trial dates, a spot left that day, and
    // once per child (name + date of birth + parent phone).
    if (!input.signedInUserId) throw new Error("TRIAL_SIGN_IN_REQUIRED");
    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,program_id,term_id,session_date,status")
      .eq("id", Number(input.trialSessionId))
      .maybeSingle();
    throwIfSupabaseError(sessionError, "Could not load the trial Saturday");
    const trialDates = term.taster_date ? [String(term.taster_date)] : ((term.trial_dates ?? []) as string[]);
    if (!session || Number(session.program_id) !== Number(program.id) || Number(session.term_id) !== Number(term.id) || session.status === "cancelled" || !trialDates.includes(String(session.session_date)) || String(session.session_date) < nassauToday()) {
      throw new Error("TRIAL_NOT_AVAILABLE");
    }
    const [{ count: trialCount, error: trialCountError }, { data: usedTrial, error: usedError }] = await Promise.all([
      db.from("registrations").select("id", { count: "exact", head: true }).eq("trial_session_id", session.id).eq("registration_status", "trial"),
      db.from("registrations").select("reference_code").eq("organization_id", program.organization_id).eq("registration_status", "trial").eq("child_dob", input.childDob).ilike("child_name", input.childName.trim()).eq("parent_phone", input.parentPhone.trim()).limit(1).maybeSingle(),
    ]);
    throwIfSupabaseError(trialCountError, "Could not count trial spots");
    throwIfSupabaseError(usedError, "Could not check earlier trials");
    if (usedTrial) throw new Error("TRIAL_ALREADY_USED");
    if (Number(trialCount ?? 0) >= Number(term.trial_spots_per_session ?? 0)) throw new Error("TRIAL_FULL");
    registrationStatus = "trial";
    trialSessionId = Number(session.id);
  } else {
    const { count, error: countError } = await db
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("program_id", program.id)
      .eq("term_id", term.id)
      .in("registration_status", ACTIVE_REGISTRATION_STATUSES);
    throwIfSupabaseError(countError, "Could not check program capacity");
    // Brief 12: a family registering is capped by the coaches on duty at
    // the next session; staff entering a child by hand answer to capacity
    // only (the roster warns when a session is over its cap).
    const cap = input.enteredByStaff
      ? Number(program.capacity)
      : capForTerm(program, term, await loadUpcomingSessions(db, [Number(term.id)], nassauToday()));
    if (Number(count ?? 0) >= cap) {
      if (mode !== "waitlist") throw new Error("PROGRAM_FULL");
      registrationStatus = "waitlist";
    } else if (mode === "waitlist") {
      // A spot opened since the page loaded: register properly instead.
      throw new Error("SPOT_OPEN");
    }
    // After a trial: the rest of the term at the weekly fee for each class
    // still to come.
    if (input.joinFromTrialCode) {
      const quote = await trialJoinQuote(input.joinFromTrialCode);
      if (!quote || quote.termId !== Number(term.id) || quote.programId !== Number(program.id)) throw new Error("JOIN_LINK_INVALID");
      joinedFrom = { id: quote.registrationId, amountCents: quote.amountCents };
    }
  }

  const normalizedEmail = input.parentEmail.trim().toLowerCase();
  const { data: duplicate, error: duplicateError } = await db
    .from("registrations")
    .select("reference_code")
    .eq("term_id", term.id)
    .eq("parent_email", normalizedEmail)
    .eq("child_dob", input.childDob)
    .ilike("child_name", input.childName.trim())
    .in("registration_status", mode === "waitlist" ? [...ACTIVE_REGISTRATION_STATUSES, "waitlist"] : ACTIVE_REGISTRATION_STATUSES)
    .limit(1)
    .maybeSingle();
  throwIfSupabaseError(duplicateError, "Could not check duplicate registration");

  if (duplicate) {
    throw new Error(`DUPLICATE:${duplicate.reference_code}`);
  }

  // Camps are paid in full (the camp fee); the weekly/term choice is for
  // term programs only (brief 06 v2, A1.4).
  const paymentFrequency: PaymentFrequency = programType === "camp" || joinedFrom ? "term" : input.paymentFrequency;
  const amountDueCents = registrationStatus === "trial"
    ? 0
    : joinedFrom
      ? joinedFrom.amountCents
      : amountDueFor({ programType, weeklyFeeCents: Number(term.weekly_fee_cents), termFeeCents: Number(term.term_fee_cents) }, paymentFrequency);

  // New family = neither the parent's phone nor email is on any earlier
  // registration here (handbook v1.3 §5). Computed before the insert so
  // this registration cannot match itself.
  const parentPhone = input.parentPhone.trim();
  const [byPhone, byEmail] = await Promise.all([
    countFamilyMatches(db, Number(program.organization_id), "parent_phone", parentPhone || null),
    countFamilyMatches(db, Number(program.organization_id), "parent_email", normalizedEmail || null),
  ]);
  const isNewFamily = byPhone + byEmail === 0;
  const attribution = input.attribution ?? EMPTY_ATTRIBUTION;
  // Staff-entered rows are never commissionable, whatever the link said:
  // when in doubt, it is not "brought by PortPass".
  const resolved: Resolved = input.enteredByStaff
    ? { sourceChannel: input.heardAboutUs ?? "unknown", commissionEligible: false, commissionReason: "Entered by staff" }
    : registrationStatus === "trial"
      ? { sourceChannel: "member_perk", commissionEligible: false, commissionReason: "Free trial (member perk)" }
      : resolveAttribution({ heard: input.heardAboutUs ?? null, referralCode: input.referralCode ?? null, attribution, isNewFamily });

  const now = new Date().toISOString();
  const referenceCode = `FP-${new Date().getUTCFullYear()}-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase()}`;

  const { data: inserted, error: insertError } = await db.from("registrations").insert({
    reference_code: referenceCode,
    organization_id: program.organization_id,
    program_id: program.id,
    term_id: term.id,
    parent_name: input.parentName.trim(),
    parent_email: normalizedEmail,
    parent_phone: parentPhone,
    relationship: input.relationship.trim(),
    child_name: input.childName.trim(),
    child_dob: input.childDob,
    gender: input.gender,
    emergency_contact_name: input.emergencyContactName.trim(),
    emergency_contact_phone: input.emergencyContactPhone.trim(),
    allergies: input.allergies.trim(),
    medical_conditions: input.medicalConditions.trim(),
    medications: input.medications.trim(),
    special_needs: input.specialNeeds.trim(),
    authorized_pickup: input.authorizedPickup.trim(),
    additional_notes: input.additionalNotes.trim(),
    photo_consent: input.photoConsent,
    payment_frequency: paymentFrequency,
    payment_method: input.paymentMethod,
    amount_due_cents: amountDueCents,
    registration_status: registrationStatus,
    payment_status: registrationStatus === "trial" ? "waived" : "pending",
    trial_session_id: trialSessionId,
    joined_from_registration_id: joinedFrom?.id ?? null,
    consent_version: CONSENT_VERSION,
    consent_accepted: true,
    consent_at: now,
    signature_name: input.signatureName.trim(),
    submitted_at: now,
    entered_by_staff: input.enteredByStaff?.trim() || null,
    source_channel: resolved.sourceChannel,
    utm_source: attribution.utmSource,
    utm_medium: attribution.utmMedium,
    utm_campaign: attribution.utmCampaign,
    referrer_host: attribution.referrerHost,
    referral_code: input.referralCode?.trim() || null,
    heard_about_us: input.heardAboutUs ?? null,
    is_new_family: isNewFamily,
    commission_eligible: resolved.commissionEligible,
    commission_reason: resolved.commissionReason,
  }).select("id").single();
  throwIfSupabaseError(insertError, "Could not create Futprep registration");
  if (returnLink && inserted) {
    await db.from("futprep_return_links").update({ used_registration_id: inserted.id, last_used_at: now }).eq("id", returnLink.id);
  }

  return {
    referenceCode,
    program: {
      slug: input.programSlug,
      name: program.name,
      programType,
      ageMin: Number(program.age_min),
      ageMax: Number(program.age_max),
      day: program.day_of_week,
      time: term.daily_start_time || program.start_time,
      endTime: term.daily_end_time || program.end_time || program.start_time,
      capacity: Number(program.capacity),
      weeklyFeeCents: Number(term.weekly_fee_cents),
      termFeeCents: Number(term.term_fee_cents),
    },
    term: {
      id: Number(term.id),
      name: term.name,
      startDate: term.start_date,
      endDate: term.end_date,
      breakDates: (term.break_dates ?? []) as string[],
      location: program.location,
    },
    paymentFrequency,
    amountDueCents,
    paymentStatus: (registrationStatus === "trial" ? "waived" : "pending") as PaymentStatus,
    registrationStatus,
  };
}

export type FutprepPendingRegistrationInput = {
  childName: string;
  programSlug: string;
  // Which term (brief 06 v2): a camp and a class can be open at once.
  // Absent = the program's most recent active term, as before.
  termId?: number | null;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  enteredByStaff: string;
};

// Staff fast-add for a child who is already attending: only a name and a
// class. Everything a parent would normally supply -- DOB, emergency
// contact, medical info, consent, signature -- is left genuinely null
// (never defaulted or blanked to "") so a coach can tell "not yet asked"
// apart from "asked, and the answer was none". The parent fills the rest
// in later at /futprep/my/[code]/complete.
export async function createFutprepPendingRegistration(input: FutprepPendingRegistrationInput) {
  await ensureFutprepPilotData();
  const db = getSupabaseAdmin();

  const { data: program, error: programError } = await db
    .from("programs")
    .select("id,organization_id,capacity,name,program_type")
    .eq("slug", input.programSlug)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(programError, "Could not load selected program");
  if (!program) throw new Error("INVALID_PROGRAM");

  let termQuery = db
    .from("program_terms")
    .select("id,weekly_fee_cents,term_fee_cents")
    .eq("program_id", program.id)
    .eq("active", true);
  if (input.termId) termQuery = termQuery.eq("id", input.termId);
  const { data: term, error: termError } = await termQuery
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfSupabaseError(termError, "Could not load selected term");
  if (!term) throw new Error("PROGRAM_NOT_AVAILABLE");

  const { count, error: countError } = await db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("program_id", program.id)
    .eq("term_id", term.id)
    .in("registration_status", ACTIVE_REGISTRATION_STATUSES);
  throwIfSupabaseError(countError, "Could not check program capacity");
  if (Number(count ?? 0) >= Number(program.capacity)) throw new Error("PROGRAM_FULL");

  const childName = input.childName.trim();
  const { data: duplicate, error: duplicateError } = await db
    .from("registrations")
    .select("reference_code")
    .eq("term_id", term.id)
    .ilike("child_name", childName)
    .in("registration_status", ACTIVE_REGISTRATION_STATUSES)
    .limit(1)
    .maybeSingle();
  throwIfSupabaseError(duplicateError, "Could not check duplicate registration");
  if (duplicate) throw new Error(`DUPLICATE:${duplicate.reference_code}`);

  const now = new Date().toISOString();
  const referenceCode = `FP-${new Date().getUTCFullYear()}-${crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase()}`;

  const { data: inserted, error: insertError } = await db.from("registrations").insert({
    reference_code: referenceCode,
    organization_id: program.organization_id,
    program_id: program.id,
    term_id: term.id,
    parent_name: input.parentName?.trim() || null,
    parent_email: input.parentEmail?.trim().toLowerCase() || null,
    parent_phone: input.parentPhone?.trim() || null,
    child_name: childName,
    // These four columns default to '' at the schema level (left over from
    // when they were NOT NULL), which would silently defeat the whole
    // point here -- an empty string reads as "asked, and the answer was
    // none", not "never asked". Must be set to null explicitly; omitting
    // them from the insert is not enough.
    allergies: null,
    medical_conditions: null,
    medications: null,
    special_needs: null,
    // amount_due_cents assumes weekly to start with -- an estimate, not a
    // commitment. The parent picks the real plan (and this gets
    // recalculated) at the completion step.
    // A camp is paid in full, so its estimate is the camp fee.
    payment_frequency: program.program_type === "camp" || program.program_type === "contract" ? "term" : "weekly",
    // Brief 13: a school-contract child is on the roster by name only (the
    // school holds the parent and medical details, and pays Futprep), so
    // nothing is pending and nothing is owed by a family.
    amount_due_cents: program.program_type === "contract" ? 0 : program.program_type === "camp" ? Number(term.term_fee_cents) : Number(term.weekly_fee_cents),
    registration_status: program.program_type === "contract" ? "confirmed" : "pending_details",
    payment_status: program.program_type === "contract" ? "waived" : "pending",
    consent_version: CONSENT_VERSION,
    consent_accepted: false,
    additional_notes: "",
    // Fast-added by a coach: an existing, attending child. Never
    // commissionable (growth-tracking brief, 28 Sept).
    is_new_family: false,
    commission_eligible: false,
    commission_reason: program.program_type === "contract" ? "School contract" : "Entered by staff",
    submitted_at: now,
    entered_by_staff: input.enteredByStaff.trim(),
  }).select("id").single();
  throwIfSupabaseError(insertError, "Could not create Futprep registration");

  return { referenceCode, programName: program.name, registrationId: Number(inserted!.id) };
}

export type FutprepPendingRegistration = {
  referenceCode: string;
  childName: string;
  programName: string;
  programSlug: string;
};

// Read-only lookup for the completion page. Unlike getFutprepRegistrationStatus,
// this can't require a matching DOB -- there isn't one on file yet -- so the
// reference code alone (shared with the parent directly, e.g. over WhatsApp
// by staff) is what gates access here. Only ever returns a pending_details
// row; a completed registration has nothing left to complete.
export async function getFutprepPendingRegistration(referenceCode: string): Promise<FutprepPendingRegistration | null> {
  const db = getSupabaseAdmin();
  const { data: registration, error } = await db
    .from("registrations")
    .select("reference_code,child_name,program_id,registration_status")
    .ilike("reference_code", referenceCode.trim())
    .maybeSingle();
  throwIfSupabaseError(error, "Could not look up registration");
  if (!registration || registration.registration_status !== "pending_details") return null;

  const { data: program, error: programError } = await db
    .from("programs")
    .select("name,slug")
    .eq("id", registration.program_id)
    .maybeSingle();
  throwIfSupabaseError(programError, "Could not load registration program");

  return {
    referenceCode: registration.reference_code,
    childName: registration.child_name,
    programName: program?.name ?? "",
    programSlug: program?.slug ?? "",
  };
}

export type FutprepCompletionInput = {
  referenceCode: string;
  childDob: string;
  gender: string;
  relationship: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string;
  medicalConditions: string;
  medications: string;
  specialNeeds: string;
  authorizedPickup: string;
  photoConsent: "yes" | "no";
  paymentFrequency: PaymentFrequency;
  paymentMethod: PaymentMethod;
  signatureName: string;
};

// The parent's half of the fast-add flow: fills in everything staff didn't
// ask about, moving the registration from pending_details into the normal
// pending status. Re-runs the same age check createFutprepRegistration does
// -- now that a DOB finally exists -- but with no staff present to override
// it, so a mismatch here is a hard stop pointing the parent to WhatsApp
// rather than a silent bypass.
export async function completeFutprepRegistration(input: FutprepCompletionInput) {
  const db = getSupabaseAdmin();

  const { data: registration, error } = await db
    .from("registrations")
    .select("id,program_id,term_id,registration_status")
    .ilike("reference_code", input.referenceCode.trim())
    .maybeSingle();
  throwIfSupabaseError(error, "Could not look up registration");
  if (!registration) throw new Error("NOT_FOUND");
  if (registration.registration_status !== "pending_details") throw new Error("ALREADY_COMPLETE");

  const [{ data: program, error: programError }, { data: term, error: termError }] = await Promise.all([
    db.from("programs").select("age_min,age_max,age_min_months,age_max_months,program_type").eq("id", registration.program_id).maybeSingle(),
    db.from("program_terms").select("start_date,weekly_fee_cents,term_fee_cents").eq("id", registration.term_id).maybeSingle(),
  ]);
  throwIfSupabaseError(programError, "Could not load program");
  throwIfSupabaseError(termError, "Could not load term");
  if (!program || !term) throw new Error("NOT_FOUND");

  if (!fitsAgeRule(input.childDob, term.start_date, ageRuleOf(program))) {
    throw new Error("AGE_MISMATCH");
  }

  // Camps are paid in full whatever plan the form sent (brief 06 v2).
  const programType: ProgramType = program.program_type === "camp" ? "camp" : "term";
  const paymentFrequency: PaymentFrequency = programType === "camp" ? "term" : input.paymentFrequency;
  const amountDueCents = amountDueFor({ programType, weeklyFeeCents: Number(term.weekly_fee_cents), termFeeCents: Number(term.term_fee_cents) }, paymentFrequency);
  const now = new Date().toISOString();

  const { error: updateError } = await db
    .from("registrations")
    .update({
      child_dob: input.childDob,
      gender: input.gender,
      relationship: input.relationship.trim() || null,
      parent_name: input.parentName.trim() || null,
      parent_email: input.parentEmail.trim().toLowerCase() || null,
      parent_phone: input.parentPhone.trim() || null,
      emergency_contact_name: input.emergencyContactName.trim(),
      emergency_contact_phone: input.emergencyContactPhone.trim(),
      allergies: input.allergies.trim(),
      medical_conditions: input.medicalConditions.trim(),
      medications: input.medications.trim(),
      special_needs: input.specialNeeds.trim(),
      authorized_pickup: input.authorizedPickup.trim(),
      photo_consent: input.photoConsent,
      payment_frequency: paymentFrequency,
      payment_method: input.paymentMethod,
      amount_due_cents: amountDueCents,
      registration_status: "pending",
      consent_version: CONSENT_VERSION,
      consent_accepted: true,
      consent_at: now,
      signature_name: input.signatureName.trim(),
    })
    .eq("id", registration.id);
  throwIfSupabaseError(updateError, "Could not complete Futprep registration");

  return { referenceCode: input.referenceCode, amountDueCents };
}

// ---- Part C: return links, trials, joining after a trial ---------------------

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// A returning family's early-access link. The token is shown to staff
// once; only its hash is stored.
export async function createReturnLink(sourceRegistrationId: number, createdBy: string): Promise<{ token: string }> {
  const db = getSupabaseAdmin();
  const token = randomBytes(18).toString("base64url");
  const { error } = await db.from("futprep_return_links").insert({ token_hash: hashToken(token), source_registration_id: sourceRegistrationId, created_by: createdBy });
  throwIfSupabaseError(error, "Could not create the return link");
  return { token };
}

export async function findReturnLink(token: string): Promise<{ id: number; sourceRegistrationId: number } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("futprep_return_links").select("id,source_registration_id").eq("token_hash", hashToken(token)).maybeSingle();
  throwIfSupabaseError(error, "Could not check the return link");
  return data ? { id: Number(data.id), sourceRegistrationId: Number(data.source_registration_id) } : null;
}

// What a return link fills in: parent details, the child's name and date
// of birth, the class, the emergency contact and the pick-up person.
// Never medical, allergy or medication fields -- the parent re-enters or
// confirms those.
export type ReturnPrefill = {
  parentName: string; parentEmail: string; parentPhone: string; relationship: string;
  childName: string; childDob: string; gender: string;
  emergencyContactName: string; emergencyContactPhone: string; authorizedPickup: string;
  programSlug: string;
};

export async function returnLinkPrefill(token: string): Promise<ReturnPrefill | null> {
  const link = await findReturnLink(token);
  if (!link) return null;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("registrations")
    .select("parent_name,parent_email,parent_phone,relationship,child_name,child_dob,gender,emergency_contact_name,emergency_contact_phone,authorized_pickup,program_id")
    .eq("id", link.sourceRegistrationId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the returning family");
  if (!data) return null;
  const { data: program } = await db.from("programs").select("slug").eq("id", data.program_id).maybeSingle();
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    parentName: s(data.parent_name), parentEmail: s(data.parent_email), parentPhone: s(data.parent_phone), relationship: s(data.relationship),
    childName: s(data.child_name), childDob: s(data.child_dob), gender: s(data.gender),
    emergencyContactName: s(data.emergency_contact_name), emergencyContactPhone: s(data.emergency_contact_phone), authorizedPickup: s(data.authorized_pickup),
    programSlug: s(program?.slug),
  };
}

// What /futprep/register/return/<token> shows. A link is good while some
// term is in its early-access window (until early_access_until); after
// that it has expired and the parent registers like everyone else.
export type ReturnLinkView =
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "open"; prefill: ReturnPrefill; offers: FutprepAvailability[]; preselect: { programId: number; termId: number } | null };

export async function openReturnLink(token: string, now: Date = new Date()): Promise<ReturnLinkView> {
  const prefill = await returnLinkPrefill(token);
  if (!prefill) return { state: "invalid" };
  const offers = await listFutprepOffers({ publicOnly: true, earlyAccess: true, now });
  const early = offers.filter((offer) => offer.earlyAccessOnly);
  if (early.length === 0) return { state: "expired" };
  const same = early.find((offer) => offer.slug === prefill.programSlug) ?? null;
  return { state: "open", prefill, offers, preselect: same ? { programId: same.programId, termId: same.termId } : null };
}

// The Saturdays a term offers free trials on, with the spots left each day.
export type TrialSession = { sessionId: number; date: string; spotsLeft: number };

export async function listTrialSessions(programId: number, termId: number, now: Date = new Date()): Promise<TrialSession[]> {
  const db = getSupabaseAdmin();
  const { data: term, error: termError } = await db.from("program_terms").select("trial_dates,trial_spots_per_session,taster_date").eq("id", termId).eq("program_id", programId).maybeSingle();
  throwIfSupabaseError(termError, "Could not load trial dates");
  const today = nassauToday(now);
  const configured = term?.taster_date ? [String(term.taster_date)] : ((term?.trial_dates ?? []) as string[]);
  const dates = configured.filter((date) => Boolean(date) && date >= today);
  if (!term || dates.length === 0) return [];
  const { data: sessions, error } = await db.from("sessions").select("id,session_date,status").eq("program_id", programId).eq("term_id", termId).in("session_date", dates).neq("status", "cancelled").order("session_date");
  throwIfSupabaseError(error, "Could not load trial Saturdays");
  const ids = (sessions ?? []).map((s) => Number(s.id));
  const taken = new Map<number, number>();
  if (ids.length) {
    const { data: trials, error: trialsError } = await db.from("registrations").select("trial_session_id").in("trial_session_id", ids).eq("registration_status", "trial");
    throwIfSupabaseError(trialsError, "Could not count trial spots");
    for (const t of trials ?? []) taken.set(Number(t.trial_session_id), (taken.get(Number(t.trial_session_id)) ?? 0) + 1);
  }
  const spots = Number(term.trial_spots_per_session ?? 0);
  return (sessions ?? []).map((s) => ({ sessionId: Number(s.id), date: String(s.session_date), spotsLeft: Math.max(0, spots - (taken.get(Number(s.id)) ?? 0)) }));
}

// "Join the rest of the term" after a trial: the weekly fee for each class
// after the trial Saturday.
export async function trialJoinQuote(referenceCode: string): Promise<{ registrationId: number; programId: number; termId: number; remainingSessions: number; amountCents: number; childName: string } | null> {
  const db = getSupabaseAdmin();
  const { data: trial, error } = await db
    .from("registrations")
    .select("id,program_id,term_id,trial_session_id,registration_status,child_name")
    .ilike("reference_code", referenceCode.trim())
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the trial");
  if (!trial || trial.registration_status !== "trial" || !trial.trial_session_id) return null;
  const [{ data: session }, { data: term }] = await Promise.all([
    db.from("sessions").select("session_date").eq("id", trial.trial_session_id).maybeSingle(),
    db.from("program_terms").select("weekly_fee_cents,term_fee_cents,start_date").eq("id", trial.term_id).maybeSingle(),
  ]);
  if (!session || !term) return null;
  const { count, error: countError } = await db
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("program_id", trial.program_id)
    .eq("term_id", trial.term_id)
    .gt("session_date", session.session_date)
    .gte("session_date", term.start_date)
    .neq("status", "cancelled");
  throwIfSupabaseError(countError, "Could not count the remaining classes");
  const remainingSessions = Number(count ?? 0);
  return {
    registrationId: Number(trial.id),
    programId: Number(trial.program_id),
    termId: Number(trial.term_id),
    remainingSessions,
    // A taster before the term (brief 12) leaves every Saturday to come;
    // the family never pays more than the full-term price.
    amountCents: Math.min(prorateCents(Number(term.weekly_fee_cents), remainingSessions), Number(term.term_fee_cents)),
    childName: String(trial.child_name),
  };
}

// The cap a class has right now (brief 12): min(capacity, coaches on duty
// at its next session × children per coach). Used when staff promote a
// family from the waitlist.
export async function effectiveCapForTerm(programId: number, termId: number): Promise<number> {
  const db = getSupabaseAdmin();
  const [{ data: program, error: programError }, { data: term, error: termError }] = await Promise.all([
    db.from("programs").select("capacity,children_per_coach,default_coaches").eq("id", programId).maybeSingle(),
    db.from("program_terms").select("id,start_date,taster_date").eq("id", termId).maybeSingle(),
  ]);
  throwIfSupabaseError(programError, "Could not load the program");
  throwIfSupabaseError(termError, "Could not load the term");
  if (!program || !term) return 0;
  return capForTerm(program, term, await loadUpcomingSessions(db, [termId], nassauToday()));
}
