import { nassauToday } from "@/lib/futprepTerms";
import type { PassportCoaches } from "@/lib/passports/access";
import {
  bandFor,
  canShare,
  clipAllowed,
  markWindows,
  parentPassportView,
  type MarkPhase,
  type MarkWindows,
  type ParentPassport,
  type PassportBand,
  type PassportMark,
  type PassportSkill,
  type PassportStatus,
} from "@/lib/passports/rules";
import { logAudit } from "./audit";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The Progress Passport (brief 31, D): one per child per term, scored by
// the child's coach at the start and end of term, shared with the family
// by Futprep. Futprep's own registrations only. Never a health or
// emergency column: the passport reads the child's name and date of birth,
// the program, the term and the photo permission, nothing else of the
// record. The routes decide who may read or change what
// (lib/passports/access.ts); every change here names who made it.

const ON_THE_ROLL = ["pending_details", "pending", "confirmed"];

type Subject = {
  registrationId: number;
  organizationId: number;
  childName: string;
  childDob: string | null;
  photoConsent: string | null;
  programName: string;
  programType: string;
  defaultLeadCoachId: number | null;
  termId: number;
  termName: string;
  termStart: string;
  tasterDate: string | null;
  programId: number;
};

async function loadSubject(registrationId: number): Promise<Subject | null> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data: reg, error } = await db
    .from("registrations")
    .select("id,organization_id,child_name,child_dob,photo_consent,registration_status,program_id,term_id")
    .eq("id", registrationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  throwIfSupabaseError(error, "Could not load the child");
  if (!reg || !ON_THE_ROLL.includes(String(reg.registration_status)) || reg.term_id === null) return null;
  const [{ data: program, error: programError }, { data: term, error: termError }] = await Promise.all([
    db.from("programs").select("id,name,program_type,default_lead_coach_id").eq("id", reg.program_id).maybeSingle(),
    db.from("program_terms").select("id,name,start_date,taster_date").eq("id", reg.term_id).maybeSingle(),
  ]);
  throwIfSupabaseError(programError, "Could not load the program");
  throwIfSupabaseError(termError, "Could not load the term");
  if (!program || !term) return null;
  return {
    registrationId: Number(reg.id),
    organizationId: Number(reg.organization_id),
    childName: String(reg.child_name),
    childDob: (reg.child_dob as string | null) ?? null,
    photoConsent: (reg.photo_consent as string | null) ?? null,
    programName: String(program.name),
    programType: String(program.program_type ?? "term"),
    defaultLeadCoachId: program.default_lead_coach_id === null ? null : Number(program.default_lead_coach_id),
    termId: Number(term.id),
    termName: String(term.name),
    termStart: String(term.start_date),
    tasterDate: (term.taster_date as string | null) ?? null,
    programId: Number(program.id),
  };
}

// Who scores this child: the class's lead coach, as the desk set it
// (programs.default_lead_coach_id). Being on a session's staff doesn't
// count: a coach can add themselves to any session from the roster.
export async function passportCoaches(registrationId: number): Promise<PassportCoaches | null> {
  const subject = await loadSubject(registrationId);
  if (!subject) return null;
  return { leadCoachId: subject.defaultLeadCoachId };
}

async function termWindows(subject: Subject, today: string = nassauToday()): Promise<MarkWindows> {
  const { data, error } = await getSupabaseAdmin().from("sessions").select("session_date,status").eq("program_id", subject.programId).eq("term_id", subject.termId);
  throwIfSupabaseError(error, "Could not load the term's sessions");
  return markWindows({ sessions: (data ?? []).map((s) => ({ date: String(s.session_date), cancelled: s.status === "cancelled" })), tasterDate: subject.tasterDate, programType: subject.programType, today });
}

async function skillsFor(band: PassportBand, organizationId: number): Promise<PassportSkill[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("passport_skills")
    .select("id,name,organization_id,sort_order")
    .eq("band", band)
    .eq("active", true)
    .or(`organization_id.is.null,organization_id.eq.${Number(organizationId)}`)
    .order("sort_order", { ascending: true });
  throwIfSupabaseError(error, "Could not load the skills");
  return (data ?? []).map((row) => ({ id: Number(row.id), name: String(row.name) }));
}

type PassportRow = { id: number; band: PassportBand; status: PassportStatus; shared_at: string | null };

// The child's passport for this term, made on first open (draft).
async function ensurePassport(subject: Subject, actor: string): Promise<PassportRow> {
  const db = getSupabaseAdmin();
  const { data: found, error } = await db.from("passports").select("id,band,status,shared_at").eq("registration_id", subject.registrationId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the passport");
  if (found) return found as PassportRow;
  const band = bandFor(subject.childDob, subject.termStart);
  // A plain insert: the unique index on registration_id is partial, and a
  // partial index can't be an upsert's conflict target. Two first opens at
  // once: the other one made it (23505), which is fine.
  const { error: insertError } = await db
    .from("passports")
    .insert({ organization_id: subject.organizationId, registration_id: subject.registrationId, band, created_by: actor });
  if (insertError && insertError.code !== "23505") throwIfSupabaseError(insertError, "Could not start the passport");
  const { data: made, error: madeError } = await db.from("passports").select("id,band,status,shared_at").eq("registration_id", subject.registrationId).single();
  throwIfSupabaseError(madeError, "Could not load the passport");
  return made as PassportRow;
}

async function marksOf(passportId: number): Promise<PassportMark[]> {
  const { data, error } = await getSupabaseAdmin().from("passport_marks").select("skill_id,start_score,end_score").eq("passport_id", passportId);
  throwIfSupabaseError(error, "Could not load the marks");
  return (data ?? []).map((row) => ({ skillId: Number(row.skill_id), start: row.start_score === null ? null : Number(row.start_score), end: row.end_score === null ? null : Number(row.end_score) }));
}

async function noteOf(passportId: number): Promise<{ note: string; clipUrl: string | null; nextStepOfferingId: number | null }> {
  const { data, error } = await getSupabaseAdmin().from("passport_notes").select("note,clip_url,next_step_offering_id").eq("passport_id", passportId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the note");
  return { note: String(data?.note ?? ""), clipUrl: (data?.clip_url as string | null) ?? null, nextStepOfferingId: data?.next_step_offering_id === null || data?.next_step_offering_id === undefined ? null : Number(data.next_step_offering_id) };
}

// Futprep's published offerings: the next steps a coach can suggest.
export async function nextStepChoices(): Promise<Array<{ id: number; name: string }>> {
  const organizationId = await futprepOrganizationId();
  const { data, error } = await getSupabaseAdmin().from("offerings").select("id,name").eq("organization_id", organizationId).eq("is_published", true).order("name");
  throwIfSupabaseError(error, "Could not load the next steps");
  return (data ?? []).map((row) => ({ id: Number(row.id), name: String(row.name) }));
}

export type StaffPassport = {
  registrationId: number;
  childName: string;
  programName: string;
  termName: string;
  band: PassportBand;
  status: PassportStatus;
  sharedAt: string | null;
  skills: PassportSkill[];
  marks: PassportMark[];
  note: string;
  clipUrl: string | null;
  // The family said yes to photos and videos; without it there is no clip field.
  clipAllowed: boolean;
  nextStepOfferingId: number | null;
  nextSteps: Array<{ id: number; name: string }>;
  windows: MarkWindows;
  canShare: boolean;
};

// The passport as a coach or the desk sees it, made on first open.
export async function getStaffPassport(registrationId: number, actor: string): Promise<StaffPassport | null> {
  const subject = await loadSubject(registrationId);
  if (!subject) return null;
  const passport = await ensurePassport(subject, actor);
  const [skills, marks, note, nextSteps, windows] = await Promise.all([skillsFor(passport.band, subject.organizationId), marksOf(passport.id), noteOf(passport.id), nextStepChoices(), termWindows(subject)]);
  const allowed = clipAllowed(subject.photoConsent);
  return {
    registrationId: subject.registrationId,
    childName: subject.childName,
    programName: subject.programName,
    termName: subject.termName,
    band: passport.band,
    status: passport.status,
    sharedAt: passport.shared_at,
    skills,
    marks,
    note: note.note,
    clipUrl: allowed ? note.clipUrl : null,
    clipAllowed: allowed,
    nextStepOfferingId: note.nextStepOfferingId,
    nextSteps,
    windows,
    canShare: passport.status === "draft" && canShare(skills, marks),
  };
}

// The windows only, for the route's check before a save.
export async function passportWindows(registrationId: number): Promise<MarkWindows | null> {
  const subject = await loadSubject(registrationId);
  return subject ? termWindows(subject) : null;
}

// One tap: one skill's start or end mark. A shared passport is final.
export async function savePassportMark(input: { registrationId: number; skillId: number; phase: MarkPhase; score: number; actor: string }): Promise<void> {
  const subject = await loadSubject(input.registrationId);
  if (!subject) throw new Error("NOT_FOUND");
  const passport = await ensurePassport(subject, input.actor);
  if (passport.status === "shared") throw new Error("SHARED");
  const skills = await skillsFor(passport.band, subject.organizationId);
  if (!skills.some((s) => s.id === input.skillId)) throw new Error("BAD_SKILL");
  // One upsert: only this phase's column is written, so the other stays.
  // The database refuses it once the passport is shared (a trigger).
  const column = input.phase === "start" ? "start_score" : "end_score";
  const { error } = await getSupabaseAdmin()
    .from("passport_marks")
    .upsert({ passport_id: passport.id, skill_id: input.skillId, [column]: input.score, updated_by: input.actor, updated_at: new Date().toISOString() }, { onConflict: "passport_id,skill_id" });
  if (error?.message?.includes("PASSPORT_SHARED")) throw new Error("SHARED");
  throwIfSupabaseError(error, "Could not save the mark");
}

// The coach's note, a clip (only with photo permission yes) and a next
// step (one of Futprep's published offerings). A shared passport is final.
export async function savePassportNote(input: { registrationId: number; note: string; clipUrl: string | null; nextStepOfferingId: number | null; actor: string }): Promise<void> {
  const subject = await loadSubject(input.registrationId);
  if (!subject) throw new Error("NOT_FOUND");
  const passport = await ensurePassport(subject, input.actor);
  if (passport.status === "shared") throw new Error("SHARED");
  if (input.clipUrl !== null && !clipAllowed(subject.photoConsent)) throw new Error("CLIP_NOT_ALLOWED");
  if (input.nextStepOfferingId !== null && !(await nextStepChoices()).some((o) => o.id === input.nextStepOfferingId)) throw new Error("BAD_NEXT_STEP");
  const { error } = await getSupabaseAdmin()
    .from("passport_notes")
    .upsert({ passport_id: passport.id, note: input.note, clip_url: input.clipUrl, next_step_offering_id: input.nextStepOfferingId, updated_by: input.actor, updated_at: new Date().toISOString() }, { onConflict: "passport_id" });
  if (error?.message?.includes("CLIP_NOT_ALLOWED")) throw new Error("CLIP_NOT_ALLOWED");
  if (error?.message?.includes("PASSPORT_SHARED")) throw new Error("SHARED");
  throwIfSupabaseError(error, "Could not save the note");
}

// Share it with the family: once every skill has an end mark. For good.
export async function sharePassport(input: { registrationId: number; actor: string }): Promise<void> {
  const subject = await loadSubject(input.registrationId);
  if (!subject) throw new Error("NOT_FOUND");
  const passport = await ensurePassport(subject, input.actor);
  if (passport.status === "shared") return;
  const [skills, marks] = await Promise.all([skillsFor(passport.band, subject.organizationId), marksOf(passport.id)]);
  if (!canShare(skills, marks)) throw new Error("NOT_READY");
  const { data, error } = await getSupabaseAdmin()
    .from("passports")
    .update({ status: "shared", shared_at: new Date().toISOString(), shared_by: input.actor, updated_at: new Date().toISOString() })
    .eq("id", passport.id)
    .eq("status", "draft")
    .select("id");
  throwIfSupabaseError(error, "Could not share the passport");
  if ((data ?? []).length > 0) {
    await logAudit({ organizationId: subject.organizationId, action: "futprep.passport_shared", targetTable: "passports", targetId: passport.id, after: { registrationId: subject.registrationId, by: input.actor } });
  }
}

// What the family sees on /futprep/my/[code]: nothing until it is shared.
// Only ever called after the lookup has matched the code and the child's
// date of birth.
export async function sharedPassportFor(referenceCode: string): Promise<ParentPassport | null> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data: reg, error } = await db.from("registrations").select("id").eq("reference_code", referenceCode).eq("organization_id", organizationId).maybeSingle();
  throwIfSupabaseError(error, "Could not find the registration");
  if (!reg) return null;
  const { data: passport, error: passportError } = await db.from("passports").select("id,band,status,shared_at").eq("registration_id", reg.id).maybeSingle();
  throwIfSupabaseError(passportError, "Could not load the passport");
  if (!passport || passport.status !== "shared") return null;
  const subject = await loadSubject(Number(reg.id));
  if (!subject) return null;
  const [skills, marks, note] = await Promise.all([skillsFor(passport.band as PassportBand, subject.organizationId), marksOf(Number(passport.id)), noteOf(Number(passport.id))]);
  let nextStep: { name: string; published: boolean; futprep: boolean } | null = null;
  if (note.nextStepOfferingId !== null) {
    const { data: offering } = await db.from("offerings").select("name,is_published,organization_id").eq("id", note.nextStepOfferingId).maybeSingle();
    if (offering) nextStep = { name: String(offering.name), published: Boolean(offering.is_published), futprep: Number(offering.organization_id) === organizationId };
  }
  return parentPassportView({
    status: "shared",
    childName: subject.childName,
    programName: subject.programName,
    termName: subject.termName,
    sharedAt: (passport.shared_at as string | null) ?? null,
    skills,
    marks,
    note: note.note,
    clipUrl: note.clipUrl,
    photoConsent: subject.photoConsent,
    nextStep,
  });
}

export type PassportCount = { termName: string; started: number; startMarked: number; endMarked: number; shared: number };

// For the operating map: Futprep's passports per term, by how far along.
export async function passportCounts(): Promise<PassportCount[]> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data, error } = await db
    .from("passports")
    .select("id,status,registrations!inner(term_id,program_terms(name)),passport_marks(start_score,end_score)")
    .eq("organization_id", organizationId);
  throwIfSupabaseError(error, "Could not count the passports");
  const byTerm = new Map<string, PassportCount>();
  for (const row of data ?? []) {
    const reg = row.registrations as unknown as { program_terms: { name: string } | null } | null;
    const termName = reg?.program_terms?.name ?? "Term";
    const count = byTerm.get(termName) ?? { termName, started: 0, startMarked: 0, endMarked: 0, shared: 0 };
    const marks = (row.passport_marks ?? []) as Array<{ start_score: number | null; end_score: number | null }>;
    count.started += 1;
    if (marks.some((m) => m.start_score !== null)) count.startMarked += 1;
    if (marks.some((m) => m.end_score !== null)) count.endMarked += 1;
    if (row.status === "shared") count.shared += 1;
    byTerm.set(termName, count);
  }
  return [...byTerm.values()].sort((a, b) => a.termName.localeCompare(b.termName));
}
