// Futprep coach pay, school contracts and the program P&L (brief 13).
// Pay data is only ever returned to callers that have already checked who
// is asking (app/futprep/staff/pay/access.ts): Alex and platform owners see
// everyone's; a coach sees only their own.
import {
  contractInvoiceCents,
  leftForFutprep,
  monthOf,
  payForRole,
  portpassFeeCents,
  shareFee,
  type ContractBilling,
  type ContractLine,
  type LedgerRow,
  type PnlLine,
  type StaffRole,
} from "@/lib/coachPay";
import { nassauToday } from "@/lib/futprepTerms";
import { logAudit } from "./audit";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

export type PayCoach = {
  id: number;
  name: string;
  active: boolean;
  defaultLeadPayCents: number | null;
  defaultAssistantPayCents: number | null;
  staffMemberId: number | null;
};

function toPayCoach(row: Record<string, unknown>): PayCoach {
  const cents = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    id: Number(row.id),
    name: String(row.display_name),
    active: Boolean(row.active),
    defaultLeadPayCents: cents(row.default_lead_pay_cents),
    defaultAssistantPayCents: cents(row.default_assistant_pay_cents),
    staffMemberId: cents(row.staff_member_id),
  };
}

const COACH_COLUMNS = "id,display_name,active,member_type,sort_order,default_lead_pay_cents,default_assistant_pay_cents,staff_member_id";

// Coaches who can be put on a session: every active coach, plus a class's
// default lead even when their public profile is switched off (Coach Bex).
export async function listPayCoaches(): Promise<PayCoach[]> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const [{ data: coaches, error }, { data: leads, error: leadsError }] = await Promise.all([
    db.from("coach_profiles").select(COACH_COLUMNS).eq("organization_id", organizationId).eq("member_type", "coach").order("sort_order", { ascending: true }),
    db.from("programs").select("default_lead_coach_id").eq("organization_id", organizationId).not("default_lead_coach_id", "is", null),
  ]);
  throwIfSupabaseError(error, "Could not load coaches");
  throwIfSupabaseError(leadsError, "Could not load default leads");
  const leadIds = new Set((leads ?? []).map((row) => Number(row.default_lead_coach_id)));
  return (coaches ?? []).filter((row) => row.active || leadIds.has(Number(row.id))).map((row) => toPayCoach(row));
}

// The coach profile tied to a staff login, if any.
export async function coachForStaffMember(staffMemberId: number): Promise<PayCoach | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("coach_profiles").select(COACH_COLUMNS).eq("staff_member_id", staffMemberId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the coach");
  return data ? toPayCoach(data) : null;
}

// ---- Who coached a session --------------------------------------------------

// `locked`: this coach's entry for the session is closed and can't be
// changed from the roster. It is closed once the coach has been paid for
// the session, but the roster is never told that: whether a coach has been
// paid is pay data, for the CEO login and platform owners only.
export type SessionStaffEntry = { coachId: number; coachName: string; role: StaffRole; locked: boolean };

// Names and roles only: the roster never shows pay.
export async function getSessionStaff(sessionId: number): Promise<{ entries: SessionStaffEntry[]; suggestedLead: { coachId: number; coachName: string } | null }> {
  const db = getSupabaseAdmin();
  const { data: rows, error } = await db
    .from("session_staff")
    .select("coach_id,role,paid_at,coach_profiles(display_name)")
    .eq("session_id", sessionId)
    .order("role", { ascending: false });
  throwIfSupabaseError(error, "Could not load the coaches for this session");
  const entries = (rows ?? []).map((row) => ({
    coachId: Number(row.coach_id),
    coachName: String((row.coach_profiles as unknown as { display_name: string } | null)?.display_name ?? "Coach"),
    role: row.role as StaffRole,
    locked: row.paid_at !== null,
  }));
  if (entries.length > 0) return { entries, suggestedLead: null };

  // Nobody recorded yet: suggest the class's default lead (Coach Bex for
  // Lil Kickers and Kickers).
  const { data: session } = await db.from("sessions").select("program_id").eq("id", sessionId).maybeSingle();
  if (!session) return { entries, suggestedLead: null };
  const { data: program } = await db.from("programs").select("default_lead_coach_id").eq("id", session.program_id).maybeSingle();
  if (!program?.default_lead_coach_id) return { entries, suggestedLead: null };
  const { data: lead } = await db.from("coach_profiles").select("id,display_name").eq("id", program.default_lead_coach_id).maybeSingle();
  return { entries, suggestedLead: lead ? { coachId: Number(lead.id), coachName: String(lead.display_name) } : null };
}

// Replaces who coached a session. A row already marked paid can't be
// removed or changed. A new row is owed the coach's default rate for the
// role (nothing until Alex sets it). The session's "Coaches today" follows
// the number of coaches recorded.
export async function setSessionStaff(sessionId: number, requested: Array<{ coachId: number; role: StaffRole }>, actor: string): Promise<SessionStaffEntry[]> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const wanted = new Map<number, StaffRole>();
  for (const entry of requested) {
    if (!Number.isInteger(entry.coachId) || (entry.role !== "lead" && entry.role !== "assistant")) throw new Error("INVALID_STAFF");
    wanted.set(entry.coachId, entry.role);
  }
  if (wanted.size > 20) throw new Error("INVALID_STAFF");

  const [{ data: session, error: sessionError }, { data: existing, error: existingError }] = await Promise.all([
    db.from("sessions").select("id").eq("id", sessionId).maybeSingle(),
    db.from("session_staff").select("id,coach_id,role,paid_at").eq("session_id", sessionId),
  ]);
  throwIfSupabaseError(sessionError, "Could not load the session");
  throwIfSupabaseError(existingError, "Could not load the coaches for this session");
  if (!session) throw new Error("SESSION_NOT_FOUND");

  const coachIds = Array.from(wanted.keys());
  const { data: coaches, error: coachError } = coachIds.length
    ? await db.from("coach_profiles").select(COACH_COLUMNS).eq("organization_id", organizationId).in("id", coachIds)
    : { data: [], error: null };
  throwIfSupabaseError(coachError, "Could not load coaches");
  const coachRows = (coaches ?? []) as Array<Record<string, unknown>>;
  if (coachRows.length !== coachIds.length) throw new Error("INVALID_STAFF");
  const coachById = new Map(coachRows.map((row) => [Number(row.id), toPayCoach(row)]));

  const rows = (existing ?? []) as Array<{ id: number; coach_id: number; role: StaffRole; paid_at: string | null }>;
  for (const row of rows) {
    if (row.paid_at && wanted.get(Number(row.coach_id)) !== row.role) throw new Error("PAID_ROW_LOCKED");
  }

  const removed = rows.filter((row) => !wanted.has(Number(row.coach_id))).map((row) => row.id);
  if (removed.length) {
    const { error } = await db.from("session_staff").delete().in("id", removed);
    throwIfSupabaseError(error, "Could not update the coaches for this session");
  }
  for (const row of rows) {
    const role = wanted.get(Number(row.coach_id));
    if (!role || row.paid_at || role === row.role) continue;
    const coach = coachById.get(Number(row.coach_id))!;
    const { error } = await db.from("session_staff").update({ role, pay_cents: payForRole(coach, role) ?? 0 }).eq("id", row.id);
    throwIfSupabaseError(error, "Could not update the coaches for this session");
  }
  const known = new Set(rows.map((row) => Number(row.coach_id)));
  const added = coachIds.filter((id) => !known.has(id)).map((coachId) => {
    const role = wanted.get(coachId)!;
    return { session_id: sessionId, coach_id: coachId, role, pay_cents: payForRole(coachById.get(coachId)!, role) ?? 0, created_by: actor };
  });
  if (added.length) {
    const { error } = await db.from("session_staff").insert(added);
    throwIfSupabaseError(error, "Could not update the coaches for this session");
  }
  if (wanted.size > 0) {
    const { error } = await db.from("sessions").update({ coaches_on_duty: wanted.size }).eq("id", sessionId);
    throwIfSupabaseError(error, "Could not update the coaches on duty");
  }
  return (await getSessionStaff(sessionId)).entries;
}

// When attendance is marked on a session nobody recorded coaches for, the
// class's default lead coached it: record them so their pay isn't missed.
export async function ensureDefaultLead(sessionId: number, actor: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { count, error } = await db.from("session_staff").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  throwIfSupabaseError(error, "Could not check the coaches for this session");
  if (Number(count ?? 0) > 0) return;
  const { data: session } = await db.from("sessions").select("program_id").eq("id", sessionId).maybeSingle();
  if (!session) return;
  const { data: program } = await db.from("programs").select("default_lead_coach_id").eq("id", session.program_id).maybeSingle();
  if (!program?.default_lead_coach_id) return;
  const { data: coach } = await db.from("coach_profiles").select(COACH_COLUMNS).eq("id", program.default_lead_coach_id).maybeSingle();
  if (!coach) return;
  const { error: insertError } = await db
    .from("session_staff")
    .upsert({ session_id: sessionId, coach_id: Number(coach.id), role: "lead", pay_cents: payForRole(toPayCoach(coach), "lead") ?? 0, created_by: actor }, { onConflict: "session_id,coach_id", ignoreDuplicates: true });
  throwIfSupabaseError(insertError, "Could not record the lead coach");
}

// ---- The pay ledger ---------------------------------------------------------

type LedgerRecord = LedgerRow & { id: number };

// Sessions that have happened (today and earlier, not cancelled), with who
// coached them and the pay. `coachId` limits it to one coach.
async function loadLedger(filter: { coachId?: number } = {}): Promise<LedgerRecord[]> {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  let query = db
    .from("session_staff")
    .select("id,coach_id,role,pay_cents,paid_at,sessions!inner(session_date,status,program_id,programs!inner(name,organization_id)),coach_profiles(display_name)")
    .eq("sessions.programs.organization_id", organizationId)
    .lte("sessions.session_date", nassauToday())
    .neq("sessions.status", "cancelled");
  if (filter.coachId) query = query.eq("coach_id", filter.coachId);
  const { data, error } = await query;
  throwIfSupabaseError(error, "Could not load coach pay");
  return (data ?? []).map((row) => {
    const session = row.sessions as unknown as { session_date: string; programs: { name: string } };
    return {
      id: Number(row.id),
      coachId: Number(row.coach_id),
      coachName: String((row.coach_profiles as unknown as { display_name: string } | null)?.display_name ?? "Coach"),
      sessionDate: String(session.session_date),
      programName: String(session.programs?.name ?? "Program"),
      role: row.role as StaffRole,
      payCents: Number(row.pay_cents),
      paidAt: (row.paid_at as string | null) ?? null,
    };
  });
}

export async function listPayLedger(filter: { coachId?: number } = {}): Promise<LedgerRow[]> {
  return (await loadLedger(filter)).map(({ id: _id, ...row }) => row);
}

// "Mark paid": every unpaid session a coach coached in a month.
export async function markCoachMonthPaid(input: { coachId: number; month: string; actor: string }): Promise<{ sessions: number; totalCents: number }> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error("INVALID_MONTH");
  const rows = (await loadLedger({ coachId: input.coachId })).filter((row) => !row.paidAt && monthOf(row.sessionDate) === input.month);
  if (rows.length === 0) return { sessions: 0, totalCents: 0 };
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await db.from("session_staff").update({ paid_at: now }).in("id", rows.map((row) => row.id)).is("paid_at", null);
  throwIfSupabaseError(error, "Could not mark the pay as paid");
  const totalCents = rows.reduce((sum, row) => sum + row.payCents, 0);
  await logAudit({
    organizationId: await futprepOrganizationId(),
    action: "futprep.coach_pay_marked_paid",
    targetTable: "session_staff",
    targetId: input.coachId,
    after: { coachId: input.coachId, month: input.month, sessions: rows.length, totalCents, by: input.actor },
  });
  return { sessions: rows.length, totalCents };
}

// Alex sets a coach's default rates and which staff login is theirs.
export async function setCoachPayDefaults(input: { coachId: number; leadCents: number | null; assistantCents: number | null; staffMemberId: number | null; actor: string }): Promise<PayCoach> {
  for (const cents of [input.leadCents, input.assistantCents]) {
    if (cents !== null && (!Number.isInteger(cents) || cents < 0 || cents > 100000)) throw new Error("INVALID_RATE");
  }
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data: before } = await db.from("coach_profiles").select(COACH_COLUMNS).eq("id", input.coachId).eq("organization_id", organizationId).maybeSingle();
  if (!before) throw new Error("COACH_NOT_FOUND");
  const { data, error } = await db
    .from("coach_profiles")
    .update({ default_lead_pay_cents: input.leadCents, default_assistant_pay_cents: input.assistantCents, staff_member_id: input.staffMemberId })
    .eq("id", input.coachId)
    .select(COACH_COLUMNS)
    .single();
  if (error?.code === "23505") throw new Error("STAFF_ALREADY_LINKED");
  throwIfSupabaseError(error, "Could not save the coach's pay rates");
  await logAudit({
    organizationId,
    action: "futprep.coach_pay_rates",
    targetTable: "coach_profiles",
    targetId: input.coachId,
    before: { lead: before.default_lead_pay_cents, assistant: before.default_assistant_pay_cents, staffMemberId: before.staff_member_id },
    after: { lead: input.leadCents, assistant: input.assistantCents, staffMemberId: input.staffMemberId, by: input.actor },
  });
  return toPayCoach(data!);
}

// Staff logins a coach profile can be tied to.
export async function listStaffLogins(): Promise<Array<{ id: number; name: string }>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("staff_members").select("id,name").eq("organization_id", 1).eq("active", true).not("account_key", "is", null).order("name");
  throwIfSupabaseError(error, "Could not load staff logins");
  return (data ?? []).map((row) => ({ id: Number(row.id), name: String(row.name) }));
}

// ---- School contracts ---------------------------------------------------------

type ProgramRow = {
  id: number; name: string; program_type: string; field_cost_cents_per_term: number | null;
  contract_client: string | null; contract_fee_cents: number | null; contract_billing: string | null;
};
type TermRow = { id: number; program_id: number; name: string; start_date: string };

async function loadProgramsAndTerms() {
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data: programs, error } = await db
    .from("programs")
    .select("id,name,program_type,field_cost_cents_per_term,contract_client,contract_fee_cents,contract_billing")
    .eq("organization_id", organizationId);
  throwIfSupabaseError(error, "Could not load programs");
  const programList = (programs ?? []) as ProgramRow[];
  const ids = programList.map((p) => p.id);
  const { data: terms, error: termsError } = ids.length
    ? await db.from("program_terms").select("id,program_id,name,start_date").in("program_id", ids)
    : { data: [], error: null };
  throwIfSupabaseError(termsError, "Could not load terms");
  return { db, programs: programList, terms: (terms ?? []) as TermRow[] };
}

async function sessionCounts(db: ReturnType<typeof getSupabaseAdmin>, termIds: number[]) {
  const delivered = new Map<number, number>();
  const scheduled = new Map<number, number>();
  if (termIds.length === 0) return { delivered, scheduled };
  const today = nassauToday();
  const { data, error } = await db.from("sessions").select("term_id,session_date,status").in("term_id", termIds).neq("status", "cancelled");
  throwIfSupabaseError(error, "Could not count sessions");
  for (const row of data ?? []) {
    const termId = Number(row.term_id);
    scheduled.set(termId, (scheduled.get(termId) ?? 0) + 1);
    if (String(row.session_date) <= today) delivered.set(termId, (delivered.get(termId) ?? 0) + 1);
  }
  return { delivered, scheduled };
}

// Sessions delivered × fee (or the term fee) for every school contract.
export async function listContractLines(): Promise<ContractLine[]> {
  const { db, programs, terms } = await loadProgramsAndTerms();
  const contracts = programs.filter((p) => p.program_type === "contract");
  const contractTerms = terms.filter((t) => contracts.some((p) => p.id === Number(t.program_id)));
  const { delivered, scheduled } = await sessionCounts(db, contractTerms.map((t) => Number(t.id)));
  return contractTerms
    .map((term) => {
      const program = contracts.find((p) => p.id === Number(term.program_id))!;
      const billing = (program.contract_billing === "per_term" ? "per_term" : "per_session") as ContractBilling;
      const feeCents = Number(program.contract_fee_cents ?? 0);
      const done = delivered.get(Number(term.id)) ?? 0;
      return {
        client: program.contract_client ?? "",
        programName: program.name,
        termName: term.name,
        billing,
        feeCents,
        sessionsDelivered: done,
        sessionsScheduled: scheduled.get(Number(term.id)) ?? 0,
        invoiceCents: contractInvoiceCents(billing, feeCents, done),
        startDate: term.start_date,
      };
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.client.localeCompare(b.client))
    .map(({ startDate: _startDate, ...line }) => line);
}

// ---- Program P&L (the Money Model, per program and term) ---------------------
// Fees collected (payments received; for a contract, what to invoice)
// minus coach pay, minus the field for the term, minus the PortPass fee =
// "Left for Futprep".
export async function listProgramPnl(): Promise<PnlLine[]> {
  const { db, programs, terms } = await loadProgramsAndTerms();
  const termIds = terms.map((t) => Number(t.id));
  if (termIds.length === 0) return [];

  const [{ data: registrations, error: regError }, { data: staff, error: staffError }] = await Promise.all([
    db.from("registrations").select("id,term_id,commission_eligible").in("term_id", termIds).neq("registration_status", "cancelled"),
    db.from("session_staff").select("pay_cents,sessions!inner(term_id,session_date,status)").in("sessions.term_id", termIds).lte("sessions.session_date", nassauToday()).neq("sessions.status", "cancelled"),
  ]);
  throwIfSupabaseError(regError, "Could not load registrations");
  throwIfSupabaseError(staffError, "Could not load coach pay");
  const regRows = (registrations ?? []) as Array<{ id: number; term_id: number; commission_eligible: boolean | null }>;
  const regIds = regRows.map((r) => Number(r.id));
  const { data: payments, error: payError } = regIds.length
    ? await db.from("payments").select("registration_id,amount_cents").in("registration_id", regIds).eq("status", "received")
    : { data: [], error: null };
  throwIfSupabaseError(payError, "Could not load payments");

  const regById = new Map(regRows.map((r) => [Number(r.id), r]));
  const collected = new Map<number, number>();
  const eligible = new Map<number, number>();
  for (const payment of payments ?? []) {
    const reg = regById.get(Number(payment.registration_id));
    if (!reg) continue;
    const termId = Number(reg.term_id);
    collected.set(termId, (collected.get(termId) ?? 0) + Number(payment.amount_cents));
    if (reg.commission_eligible) eligible.set(termId, (eligible.get(termId) ?? 0) + Number(payment.amount_cents));
  }
  const coachPay = new Map<number, number>();
  for (const row of staff ?? []) {
    const termId = Number((row.sessions as unknown as { term_id: number }).term_id);
    coachPay.set(termId, (coachPay.get(termId) ?? 0) + Number(row.pay_cents));
  }
  const contractLines = await listContractLines();

  // The PortPass fee is capped per term across the classes that share it.
  const programById = new Map(programs.map((p) => [p.id, p]));
  const groups = new Map<string, number[]>();
  for (const term of terms) {
    const program = programById.get(Number(term.program_id));
    if (!program || program.program_type === "contract") continue;
    const key = `${program.program_type}:${term.name}:${term.start_date}`;
    groups.set(key, [...(groups.get(key) ?? []), Number(term.id)]);
  }
  const fee = new Map<number, number>();
  for (const ids of groups.values()) {
    const parts = ids.map((id) => eligible.get(id) ?? 0);
    const shares = shareFee(portpassFeeCents(parts.reduce((a, b) => a + b, 0)), parts);
    ids.forEach((id, i) => fee.set(id, shares[i]));
  }

  const lines: Array<PnlLine & { startDate: string }> = [];
  for (const term of terms) {
    const program = programById.get(Number(term.program_id));
    if (!program) continue;
    const termId = Number(term.id);
    const kind = (program.program_type === "camp" ? "camp" : program.program_type === "contract" ? "contract" : "term") as PnlLine["kind"];
    const feesCollectedCents = kind === "contract"
      ? contractLines.find((c) => c.programName === program.name && c.termName === term.name)?.invoiceCents ?? 0
      : collected.get(termId) ?? 0;
    const coachPayCents = coachPay.get(termId) ?? 0;
    if (feesCollectedCents === 0 && coachPayCents === 0) continue;
    const base = {
      programId: program.id,
      programName: program.name,
      termName: term.name,
      kind,
      feesCollectedCents,
      coachPayCents,
      fieldCostCents: Number(program.field_cost_cents_per_term ?? 0),
      portpassFeeCents: fee.get(termId) ?? 0,
    };
    lines.push({ ...base, leftCents: leftForFutprep(base), startDate: term.start_date });
  }
  return lines
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.programName.localeCompare(b.programName))
    .map(({ startDate: _startDate, ...line }) => line);
}

// Field hire per term for a program (brief 13's P&L; "ask Alex" on the
// Money Model). Alex and platform owners set it on the Coach pay page;
// audit-logged.
export async function setProgramFieldCost(input: { programId: number; cents: number | null; actor: string }): Promise<void> {
  if (input.cents !== null && (!Number.isInteger(input.cents) || input.cents < 0 || input.cents > 10_000_000)) throw new Error("INVALID_AMOUNT");
  const db = getSupabaseAdmin();
  const organizationId = await futprepOrganizationId();
  const { data: before } = await db.from("programs").select("id,field_cost_cents_per_term").eq("id", input.programId).eq("organization_id", organizationId).maybeSingle();
  if (!before) throw new Error("PROGRAM_NOT_FOUND");
  const { error } = await db.from("programs").update({ field_cost_cents_per_term: input.cents }).eq("id", input.programId);
  throwIfSupabaseError(error, "Could not save the field cost");
  await logAudit({
    organizationId,
    action: "futprep.field_cost",
    targetTable: "programs",
    targetId: input.programId,
    before: { fieldCostCentsPerTerm: before.field_cost_cents_per_term },
    after: { fieldCostCentsPerTerm: input.cents, by: input.actor },
  });
}
