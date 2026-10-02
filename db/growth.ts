import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";
import { SOURCE_CHANNELS, type SourceChannel } from "@/lib/attribution";
import { nassauToday } from "@/lib/futprepTerms";
import {
  buildPeriodReport,
  commissionForMonth,
  commissionForTerm,
  firstNameOf,
  GROW_WITH_US_OFFER,
  isPageEvent,
  missedTwoInARow,
  nassauClock,
  previousMonth,
  receivedDate,
  termPeriods,
  unmarkedSessions,
  type Commission,
  type CommissionTerms,
  type EventCount,
  type GrowthAttendance,
  type GrowthPayment,
  type GrowthPeriod,
  type GrowthProgram,
  type GrowthRegistration,
  type GrowthSession,
  type GrowthTerm,
  type PageEvent,
  type PeriodReport,
} from "@/lib/growth";

// The growth report (brief 05, parts 2 and 3): what the report page, the
// monthly email, the Admin Overview and the scheduled jobs read and write.
//
// The registration columns selected here are listed by name and stop at a
// child's name (reduced to a first name before it leaves this file).
// Medical, allergy, medication, emergency and pickup columns are never
// selected, so they cannot reach the report, the email or an export.

const PAGE = 1000;

// The API returns at most 1,000 rows at a time: read a whole list in pages.
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>, what: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    throwIfSupabaseError(error, `Could not load ${what}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---- Page events --------------------------------------------------------------

let futprep: { id: number; name: string; at: number } | null = null;

// The organisation whose public pages are counted today. Remembered for
// five minutes so an event costs one insert, not two queries.
export async function futprepOrganization(): Promise<{ id: number; name: string } | null> {
  if (futprep && Date.now() - futprep.at < 5 * 60_000) return futprep;
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id,name").eq("slug", "futprep").maybeSingle();
  throwIfSupabaseError(error, "Could not load the organisation");
  if (!data) return null;
  futprep = { id: Number(data.id), name: String(data.name), at: Date.now() };
  return futprep;
}

export async function recordPageEvent(input: { organizationId: number; path: string; event: PageEvent; sourceChannel: SourceChannel }): Promise<void> {
  const { error } = await getSupabaseAdmin().from("page_events").insert({ organization_id: input.organizationId, path: input.path, event: input.event, source_channel: input.sourceChannel });
  throwIfSupabaseError(error, "Could not record the page event");
}

// A ceiling on what one day can add, so a flood cannot fill the table or
// drown the report: far above a busy day's real traffic. The count is
// checked at most once a minute per server instance.
export const PAGE_EVENTS_DAILY_CAP = 20_000;
let eventsToday: { organizationId: number; count: number; at: number } | null = null;

export async function pageEventsOverCap(organizationId: number, now: Date = new Date()): Promise<boolean> {
  if (eventsToday && eventsToday.organizationId === organizationId && now.getTime() - eventsToday.at < 60_000) return eventsToday.count >= PAGE_EVENTS_DAILY_CAP;
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await getSupabaseAdmin().from("page_events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", since);
  throwIfSupabaseError(error, "Could not count page events");
  eventsToday = { organizationId, count: count ?? 0, at: now.getTime() };
  return eventsToday.count >= PAGE_EVENTS_DAILY_CAP;
}

// The report reads this term and the one before, so counts older than
// about thirteen months are no use to it and are removed by the daily job.
export const PAGE_EVENTS_KEEP_DAYS = 400;

export async function prunePageEvents(now: Date = new Date()): Promise<void> {
  const before = new Date(now.getTime() - PAGE_EVENTS_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await getSupabaseAdmin().from("page_events").delete().lt("created_at", before);
  throwIfSupabaseError(error, "Could not remove old page events");
}

// A term's views, taps and requests: everything from the day after the
// term before it ended (families find a term and sign up before it
// starts) to the term's own last day. A Nassau day starts at 04:00 or
// 05:00 UTC; an hour either way does not matter at the edge of a term.
function eventWindow(period: GrowthPeriod): { from: string; to: string } {
  return { from: `${period.eventsFrom ?? "2000-01-01"}T05:00:00Z`, to: `${nextDay(period.end)}T05:00:00Z` };
}

async function eventCounts(organizationId: number, period: GrowthPeriod): Promise<EventCount[]> {
  const { from, to } = eventWindow(period);
  const { data, error } = await getSupabaseAdmin().rpc("growth_event_counts", { p_organization_id: organizationId, p_from: from, p_to: to });
  throwIfSupabaseError(error, "Could not count page events");
  const counts: EventCount[] = [];
  for (const row of (data ?? []) as Array<{ event: string; source_channel: string; events: number | string }>) {
    if (!isPageEvent(row.event)) continue;
    const channel = (SOURCE_CHANNELS as readonly string[]).includes(row.source_channel) ? (row.source_channel as SourceChannel) : "unknown";
    counts.push({ event: row.event, sourceChannel: channel, count: Number(row.events) || 0 });
  }
  return counts;
}

async function privateRequestCount(organizationId: number, period: GrowthPeriod): Promise<number> {
  const { from, to } = eventWindow(period);
  const { count, error } = await getSupabaseAdmin().from("private_session_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", from).lt("created_at", to);
  throwIfSupabaseError(error, "Could not count private session requests");
  return count ?? 0;
}

// ---- The rows the report is built from -------------------------------------------

export type GrowthData = {
  programs: GrowthProgram[];
  terms: GrowthTerm[];
  registrations: GrowthRegistration[];
  payments: GrowthPayment[];
  sessions: GrowthSession[];
  attendance: GrowthAttendance[];
};

export async function loadGrowthData(organizationId: number): Promise<GrowthData> {
  const db = getSupabaseAdmin();
  const { data: programRows, error: programError } = await db.from("programs").select("id,name,capacity,program_type").eq("organization_id", organizationId);
  throwIfSupabaseError(programError, "Could not load programmes");
  // Classes and camps. A school contract is a different arrangement (the
  // school pays, the children are the school's) and is not in this report.
  const kept = (programRows ?? []).filter((p) => p.program_type !== "contract");
  const programs: GrowthProgram[] = kept.map((p) => ({ id: Number(p.id), name: String(p.name), capacity: Number(p.capacity) || 0 }));
  const classPrograms = new Set(kept.filter((p) => p.program_type === "term").map((p) => Number(p.id)));
  if (programs.length === 0) return { programs, terms: [], registrations: [], payments: [], sessions: [], attendance: [] };

  const { data: termRows, error: termError } = await db.from("program_terms").select("id,program_id,name,start_date,end_date").in("program_id", programs.map((p) => p.id));
  throwIfSupabaseError(termError, "Could not load terms");
  const terms: GrowthTerm[] = (termRows ?? []).map((t) => ({ id: Number(t.id), programId: Number(t.program_id), name: String(t.name), startDate: String(t.start_date), endDate: String(t.end_date), isClass: classPrograms.has(Number(t.program_id)) }));
  const termIds = terms.map((t) => t.id);
  if (termIds.length === 0) return { programs, terms, registrations: [], payments: [], sessions: [], attendance: [] };

  const registrationRows = await allRows<Record<string, unknown>>(
    (from, to) =>
      db
        .from("registrations")
        // Named columns only: nothing about a child's health, emergency
        // contact or pickup is ever read for the report.
        .select("id,program_id,term_id,registration_status,is_new_family,commission_eligible,submitted_at,amount_due_cents,payment_frequency,payment_status,child_name")
        .eq("organization_id", organizationId)
        .in("term_id", termIds)
        .order("id", { ascending: true })
        .range(from, to),
    "registrations",
  );
  const registrations: GrowthRegistration[] = registrationRows.map((r) => ({
    id: Number(r.id),
    programId: Number(r.program_id),
    termId: Number(r.term_id),
    status: String(r.registration_status),
    isNewFamily: r.is_new_family === null || r.is_new_family === undefined ? null : Boolean(r.is_new_family),
    commissionEligible: Boolean(r.commission_eligible),
    submittedOn: nassauToday(new Date(String(r.submitted_at))),
    amountDueCents: Number(r.amount_due_cents) || 0,
    // A camp is one fee whatever the family chose on the form.
    paysWeekly: r.payment_frequency === "weekly" && classPrograms.has(Number(r.program_id)),
    feeWaived: r.payment_status === "waived",
    childFirstName: firstNameOf(String(r.child_name ?? "")),
  }));

  const payments: GrowthPayment[] = [];
  for (const ids of chunks(registrations.map((r) => r.id), 200)) {
    const rows = await allRows<Record<string, unknown>>(
      (from, to) => db.from("payments").select("id,registration_id,amount_cents,received_at,created_at").eq("status", "received").in("registration_id", ids).order("id", { ascending: true }).range(from, to),
      "payments",
    );
    for (const p of rows) payments.push({ id: Number(p.id), registrationId: Number(p.registration_id), amountCents: Number(p.amount_cents) || 0, receivedOn: receivedDate(String(p.received_at ?? p.created_at)) });
  }

  const sessionRows = await allRows<Record<string, unknown>>(
    (from, to) => db.from("sessions").select("id,program_id,term_id,session_date,status").in("term_id", termIds).order("id", { ascending: true }).range(from, to),
    "sessions",
  );
  // A session dated before its term starts is the free taster Saturday:
  // only taster children are on its roster, so it is not a session of the
  // term for attendance, the missed-two list or the "not marked" alert.
  const startOf = new Map(terms.map((t): [number, string] => [t.id, t.startDate]));
  const sessions: GrowthSession[] = sessionRows
    .map((s) => ({ id: Number(s.id), programId: Number(s.program_id), termId: Number(s.term_id), date: String(s.session_date), status: String(s.status) }))
    .filter((s) => s.date >= (startOf.get(s.termId) ?? s.date));

  const attendance: GrowthAttendance[] = [];
  for (const ids of chunks(sessions.map((s) => s.id), 200)) {
    const rows = await allRows<Record<string, unknown>>(
      (from, to) => db.from("attendance").select("id,registration_id,session_id,status").in("session_id", ids).order("id", { ascending: true }).range(from, to),
      "attendance",
    );
    for (const a of rows) attendance.push({ registrationId: Number(a.registration_id), sessionId: Number(a.session_id), status: String(a.status) });
  }
  return { programs, terms, registrations, payments, sessions, attendance };
}

// ---- The commission plan ------------------------------------------------------------

export type CommissionPlan = CommissionTerms & { startsOn: string; endsOn: string | null };

// The business's commission plan, if a founder has put it on one. No row
// means nothing is charged and no billing event is ever written.
export async function commissionPlan(organizationId: number, today: string): Promise<CommissionPlan | null> {
  const { data, error } = await getSupabaseAdmin().from("commission_plans").select("rate_bps,cap_cents_per_month,starts_on,ends_on").eq("organization_id", organizationId).eq("kind", "grow_with_us").maybeSingle();
  throwIfSupabaseError(error, "Could not load the commission plan");
  if (!data) return null;
  const plan: CommissionPlan = { rateBps: Number(data.rate_bps), capCentsPerMonth: Number(data.cap_cents_per_month), startsOn: String(data.starts_on), endsOn: data.ends_on ? String(data.ends_on) : null };
  if (plan.startsOn > today) return null;
  return plan;
}

// Payments a plan covers: received while the plan was running.
function withinPlan(payments: GrowthPayment[], plan: CommissionPlan | null): GrowthPayment[] {
  if (!plan) return payments;
  return payments.filter((p) => p.receivedOn >= plan.startsOn && (!plan.endsOn || p.receivedOn <= plan.endsOn));
}

type ExistingEvent = { id: number; paymentId: number; feeCents: number; invoiced: boolean };

// Every commission event already written for the business. One row per
// payment from a commissionable family, so it stays small.
async function existingCommissionEvents(organizationId: number): Promise<ExistingEvent[]> {
  const rows = await allRows<Record<string, unknown>>(
    (from, to) => getSupabaseAdmin().from("billing_events").select("id,source_id,fee_cents,invoice_line_id").eq("organization_id", organizationId).eq("kind", "grow_with_us_commission").eq("source_table", "payments").order("id", { ascending: true }).range(from, to),
    "billing events",
  );
  return rows.map((row) => ({ id: Number(row.id), paymentId: Number(row.source_id), feeCents: Number(row.fee_cents) || 0, invoiced: row.invoice_line_id !== null && row.invoice_line_id !== undefined }));
}

// Fees already on an invoice, by payment: fixed, and counted against the cap first.
function lockedFees(events: ExistingEvent[]): Map<number, number> {
  return new Map(events.filter((e) => e.invoiced).map((e): [number, number] => [e.paymentId, e.feeCents]));
}

// ---- The report ---------------------------------------------------------------------

export type GrowthValue = {
  // false: the business is not on the plan, and the numbers show what the
  // Founding Partner offer would come to. Nothing is invoiced.
  onPlan: boolean;
  terms: CommissionTerms;
  month: string;
  thisMonth: { families: number; collectedCents: number; feeCents: number };
  lastMonth: { families: number; collectedCents: number; feeCents: number };
  term: { label: string; families: number; collectedCents: number; uncappedFeeCents: number; feeCents: number; capCents: number; capApplied: boolean } | null;
  invoicedCents: number;
};

export type GrowthReport = {
  organizationId: number;
  organizationName: string;
  today: string;
  current: PeriodReport | null;
  previous: PeriodReport | null;
  // The next term, once it exists: families sign up and pay for it while
  // this term is still running.
  upcoming: PeriodReport | null;
  missedTwo: Array<{ childFirstName: string; programName: string }>;
  unmarked: Array<{ date: string; programName: string }>;
  value: GrowthValue;
};

export async function getGrowthReport(organization: { id: number; name: string }, now: Date = new Date()): Promise<GrowthReport> {
  const clock = nassauClock(now);
  const today = clock.date;
  const data = await loadGrowthData(organization.id);
  const { current, previous, upcoming } = termPeriods(data.terms, today);
  const plan = await commissionPlan(organization.id, today);
  const terms: CommissionTerms = plan ?? GROW_WITH_US_OFFER;

  const periodReport = async (period: GrowthPeriod | null): Promise<PeriodReport | null> => {
    if (!period) return null;
    const [events, privateRequests] = await Promise.all([eventCounts(organization.id, period), privateRequestCount(organization.id, period)]);
    return buildPeriodReport({ period, today, programs: data.programs, terms: data.terms, registrations: data.registrations, payments: data.payments, sessions: data.sessions, attendance: data.attendance, events, privateRequests });
  };
  const [currentReport, previousReport, upcomingReport] = await Promise.all([periodReport(current), periodReport(previous), periodReport(upcoming)]);

  const inCurrent = current ? new Set(current.termIds) : new Set<number>();
  // "Not marked" looks back two weeks, which can reach into the term
  // before: the last Saturday of a term must not vanish the day it ends.
  const inEither = new Set([...(current?.termIds ?? []), ...(previous?.termIds ?? [])]);
  const programName = (id: number) => data.programs.find((p) => p.id === id)?.name ?? "Class";

  // The fee, for both terms: a month at a term change has payments for each.
  const existing = plan ? await existingCommissionEvents(organization.id) : [];
  const locked = lockedFees(existing);
  const payments = withinPlan(data.payments, plan);
  const commissionOf = (period: GrowthPeriod | null): Commission | null => (period ? commissionForTerm({ period, registrations: data.registrations, payments, terms, locked }) : null);
  const currentCommission = commissionOf(current);
  // A month can hold payments for the term before, this term and the next
  // one (families pay for next term while this one runs).
  const both = [commissionOf(previous), currentCommission, commissionOf(upcoming)].filter((c): c is Commission => c !== null);
  const month = today.slice(0, 7);
  const currentPaymentIds = new Set((currentCommission?.lines ?? []).map((l) => l.paymentId));

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    today,
    current: currentReport,
    previous: previousReport,
    upcoming: upcomingReport,
    missedTwo: missedTwoInARow({ today, programs: data.programs, registrations: data.registrations.filter((r) => inCurrent.has(r.termId)), sessions: data.sessions.filter((s) => inCurrent.has(s.termId)), attendance: data.attendance }),
    unmarked: unmarkedSessions({ clock, sessions: data.sessions.filter((s) => inEither.has(s.termId)), attendance: data.attendance, registrations: data.registrations.filter((r) => inEither.has(r.termId)) }).map((s) => ({ date: s.date, programName: programName(s.programId) })),
    value: {
      onPlan: plan !== null,
      terms,
      month,
      thisMonth: commissionForMonth(both, month),
      lastMonth: commissionForMonth(both, previousMonth(month)),
      term: currentCommission && current ? { label: current.label, families: currentCommission.families, collectedCents: currentCommission.collectedCents, uncappedFeeCents: currentCommission.uncappedFeeCents, feeCents: currentCommission.feeCents, capCents: currentCommission.capCents, capApplied: currentCommission.capApplied } : null,
      // Of this term's fees, what is already on an invoice.
      invoicedCents: existing.filter((e) => e.invoiced && currentPaymentIds.has(e.paymentId)).reduce((sum, e) => sum + e.feeCents, 0),
    },
  };
}

// ---- Billing events: the fee, one row per payment ---------------------------------------

// Writes the commission as billing events (kind grow_with_us_commission),
// one per payment received from a commissionable family, for a business
// that is on the plan. Safe to run any number of times: an event is keyed
// by its payment, an event already on an invoice is never touched (and its
// fee counts against the cap before anything else is shared out), and an
// uninvoiced event whose payment was voided is removed.
// Returns null (and writes nothing) for a business that is not on the plan.
export async function syncCommissionEvents(organizationId: number, now: Date = new Date()): Promise<{ written: number; removed: number } | null> {
  const today = nassauClock(now).date;
  const plan = await commissionPlan(organizationId, today);
  if (!plan) return null;
  const db = getSupabaseAdmin();
  const data = await loadGrowthData(organizationId);
  const { current, previous, upcoming } = termPeriods(data.terms, today);
  const periods = [previous, current, upcoming].filter((p): p is GrowthPeriod => p !== null);
  if (periods.length === 0) return { written: 0, removed: 0 };

  const existing = await existingCommissionEvents(organizationId);
  const locked = lockedFees(existing);
  const wanted = new Map<number, { receivedOn: string; collectedCents: number; feeCents: number }>();
  for (const period of periods) {
    const commission = commissionForTerm({ period, registrations: data.registrations, payments: withinPlan(data.payments, plan), terms: plan, locked });
    for (const line of commission.lines) if (line.feeCents > 0) wanted.set(line.paymentId, { receivedOn: line.receivedOn, collectedCents: line.collectedCents, feeCents: line.feeCents });
  }
  const byPayment = new Map(existing.map((e): [number, ExistingEvent] => [e.paymentId, e]));

  let written = 0;
  for (const [paymentId, line] of wanted) {
    const have = byPayment.get(paymentId);
    if (have && (have.invoiced || have.feeCents === line.feeCents)) continue;
    const row = { organization_id: organizationId, kind: "grow_with_us_commission", source_table: "payments", source_id: paymentId, event_on: line.receivedOn, booking_value_cents: line.collectedCents, rate_bps: plan.rateBps, flat_cents: 0, fee_cents: line.feeCents, updated_at: now.toISOString() };
    const result = have ? await db.from("billing_events").update(row).eq("id", have.id).is("invoice_line_id", null) : await db.from("billing_events").upsert(row, { onConflict: "kind,source_table,source_id", ignoreDuplicates: true });
    throwIfSupabaseError(result.error, "Could not write a billing event");
    written += 1;
  }

  // An uninvoiced event that is no longer earned is removed, but only when
  // its payment is gone (a void deletes the row) or belongs to one of the
  // terms just recomputed. A fee from an older term is left alone: it was
  // not looked at here, so its absence from `wanted` means nothing.
  const candidates = existing.filter((e) => !e.invoiced && !wanted.has(e.paymentId));
  let removed = 0;
  if (candidates.length > 0) {
    const recomputed = new Set(periods.flatMap((p) => p.termIds));
    const termOf = new Map(data.registrations.map((r): [number, number] => [r.id, r.termId]));
    const registrationOf = new Map<number, number | null>();
    for (const ids of chunks(candidates.map((e) => e.paymentId), 200)) {
      const { data: stillThere, error: paymentError } = await db.from("payments").select("id,registration_id").in("id", ids);
      throwIfSupabaseError(paymentError, "Could not check payments");
      for (const p of stillThere ?? []) registrationOf.set(Number(p.id), p.registration_id === null ? null : Number(p.registration_id));
    }
    for (const event of candidates) {
      const gone = !registrationOf.has(event.paymentId);
      const registrationId = registrationOf.get(event.paymentId);
      const termId = registrationId === null || registrationId === undefined ? undefined : termOf.get(registrationId);
      if (!gone && (termId === undefined || !recomputed.has(termId))) continue;
      const { error: removeError } = await db.from("billing_events").delete().eq("id", event.id).is("invoice_line_id", null);
      throwIfSupabaseError(removeError, "Could not remove a billing event");
      removed += 1;
    }
  }
  return { written, removed };
}

// ---- Scheduled jobs: once per period ---------------------------------------------------

// Claims a job's period. true: this run owns it. false: another run already
// did (a retry, or the second schedule kept for daylight saving).
export async function claimJobRun(job: string, periodKey: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from("job_runs").insert({ job, period_key: periodKey });
  if (error && (error as { code?: string }).code === "23505") return false;
  throwIfSupabaseError(error, "Could not claim the job run");
  return true;
}

// Gives a period back when the job could deliver nothing (the email
// provider was down, the report could not be built), so the next run tries
// again instead of finding the period already spent.
export async function releaseJobRun(job: string, periodKey: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("job_runs").delete().eq("job", job).eq("period_key", periodKey);
  throwIfSupabaseError(error, "Could not release the job run");
}

// ---- Messages log --------------------------------------------------------------------

export type MessageStatus = "sent" | "failed" | "skipped";

// One row per email PortPass tried to send. Never the email's text.
// providerId is the email service's id for the message, which its webhook
// later reports "delivered" or "bounced" against.
export async function logMessage(input: { organizationId: number | null; template: string; recipient: string; status: MessageStatus; detail?: string | null; providerId?: string | null }): Promise<void> {
  // An address is kept in lower case, so a search finds every email sent to
  // it however it was typed. A placeholder ("(no owner on file)") or a
  // coach's name is kept as it is.
  const typed = input.recipient.trim().slice(0, 254);
  const recipient = typed.includes("@") ? typed.toLowerCase() : typed;
  const { error } = await getSupabaseAdmin().from("message_log").insert({ organization_id: input.organizationId, template: input.template, recipient, status: input.status, detail: input.detail ? input.detail.slice(0, 200) : null, provider_id: input.providerId ? input.providerId.slice(0, 100) : null });
  throwIfSupabaseError(error, "Could not write the messages log");
}

// ---- Attendance: who to nudge, and what was never marked ---------------------------------

export type SessionToNudge = { sessionId: number; programName: string; startTime: string; coaches: Array<{ name: string; email: string | null }> };

// Today's sessions (Nassau) with the coaches on duty: the ones recorded
// for the session, or the class's usual lead when nobody is recorded yet.
export async function sessionsToNudge(organizationId: number, now: Date = new Date()): Promise<SessionToNudge[]> {
  const db = getSupabaseAdmin();
  const today = nassauClock(now).date;
  const { data: programs, error: programError } = await db.from("programs").select("id,name,default_lead_coach_id").eq("organization_id", organizationId);
  throwIfSupabaseError(programError, "Could not load programmes");
  if (!programs || programs.length === 0) return [];
  const { data: sessions, error: sessionError } = await db.from("sessions").select("id,program_id,term_id,start_time,status").eq("session_date", today).in("program_id", programs.map((p) => Number(p.id)));
  throwIfSupabaseError(sessionError, "Could not load today's sessions");
  const live = (sessions ?? []).filter((s) => s.status !== "cancelled");
  if (live.length === 0) return [];

  const { data: staffing, error: staffError } = await db.from("session_staff").select("session_id,coach_id").in("session_id", live.map((s) => Number(s.id)));
  throwIfSupabaseError(staffError, "Could not load who is coaching");
  const coachIds = new Set<number>();
  for (const row of staffing ?? []) coachIds.add(Number(row.coach_id));
  for (const p of programs) if (p.default_lead_coach_id) coachIds.add(Number(p.default_lead_coach_id));
  const coaches = new Map<number, { name: string; email: string | null }>();
  if (coachIds.size > 0) {
    const { data: profiles, error: profileError } = await db.from("coach_profiles").select("id,display_name,staff_member_id").in("id", Array.from(coachIds));
    throwIfSupabaseError(profileError, "Could not load coaches");
    const staffIds = (profiles ?? []).map((c) => c.staff_member_id).filter((id): id is number => id !== null && id !== undefined).map(Number);
    const emails = new Map<number, string | null>();
    if (staffIds.length > 0) {
      const { data: staff, error: memberError } = await db.from("staff_members").select("id,email,active").in("id", staffIds);
      throwIfSupabaseError(memberError, "Could not load staff");
      for (const s of staff ?? []) emails.set(Number(s.id), s.active && typeof s.email === "string" && s.email.includes("@") ? s.email.trim() : null);
    }
    for (const c of profiles ?? []) coaches.set(Number(c.id), { name: String(c.display_name), email: c.staff_member_id ? emails.get(Number(c.staff_member_id)) ?? null : null });
  }

  return live.map((s) => {
    const program = programs.find((p) => Number(p.id) === Number(s.program_id));
    const recorded = (staffing ?? []).filter((row) => Number(row.session_id) === Number(s.id)).map((row) => Number(row.coach_id));
    const onDuty = recorded.length > 0 ? recorded : program?.default_lead_coach_id ? [Number(program.default_lead_coach_id)] : [];
    return { sessionId: Number(s.id), programName: String(program?.name ?? "Class"), startTime: String(s.start_time ?? ""), coaches: onDuty.map((id) => coaches.get(id)).filter((c): c is { name: string; email: string | null } => Boolean(c)) };
  });
}

// Who the monthly report goes to: the business's owners on PortPass. Until
// the owner has a PortPass account of their own, the CEO staff login's
// email address (if one is on file) is the owner's.
export async function reportRecipients(organizationId: number, ownerEmails: string[]): Promise<string[]> {
  if (ownerEmails.length > 0) return ownerEmails;
  const { data, error } = await getSupabaseAdmin().from("staff_members").select("email").eq("organization_id", organizationId).eq("role", "ceo").eq("active", true);
  throwIfSupabaseError(error, "Could not load the business's CEO login");
  return (data ?? []).map((row) => (typeof row.email === "string" ? row.email.trim() : "")).filter((email) => email.includes("@"));
}

export type UnmarkedSession ={ sessionId: number; date: string; programName: string; organizationName: string };

// For the Admin Overview: sessions in the last two weeks whose attendance
// was never marked (from noon on the day), in this term or the one before.
export async function listUnmarkedAttendance(now: Date = new Date()): Promise<UnmarkedSession[]> {
  const organization = await futprepOrganization();
  if (!organization) return [];
  const clock = nassauClock(now);
  const data = await loadGrowthData(organization.id);
  const { current, previous } = termPeriods(data.terms, clock.date);
  const inEither = new Set([...(current?.termIds ?? []), ...(previous?.termIds ?? [])]);
  if (inEither.size === 0) return [];
  return unmarkedSessions({ clock, sessions: data.sessions.filter((s) => inEither.has(s.termId)), attendance: data.attendance, registrations: data.registrations.filter((r) => inEither.has(r.termId)) }).map((s) => ({
    sessionId: s.id,
    date: s.date,
    programName: data.programs.find((p) => p.id === s.programId)?.name ?? "Class",
    organizationName: organization.name,
  }));
}
