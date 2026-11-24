import { nassauToday } from "@/lib/futprepTerms";
import { buildThisWeek, type HomeBusinessRow, type ThisWeekCard } from "@/lib/parentHome";
import { exactEmail } from "./accountBookings";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Parent home, PR 2: the rows behind the "this week" card (lib/parentHome.ts),
// matched to the account's own proven email the same way the account page's
// registrations are (db/accountBookings.ts). Rule 3: the registration
// columns read here are the reference, class, status, payment and the
// child's name (only its first word is shown), never a health, emergency,
// pickup or contact field.

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : "");
const LIMIT = 20;

export async function listThisWeek(email: string | null, today: string = nassauToday()): Promise<ThisWeekCard[]> {
  if (!email || !email.includes("@") || /[*\s]/.test(email)) return [];
  const db = getSupabaseAdmin();
  const { data: regs, error } = await db
    .from("registrations")
    .select("reference_code,organization_id,program_id,term_id,child_name,registration_status,payment_status,amount_due_cents,trial_session_id")
    .ilike("parent_email", exactEmail(email))
    .in("registration_status", ["confirmed", "trial", "pending"])
    .order("submitted_at", { ascending: false })
    .limit(LIMIT);
  throwIfSupabaseError(error, "Could not read this week's classes");
  const rows = (regs ?? []) as Row[];
  if (rows.length === 0) return [];

  const programIds = [...new Set(rows.map((r) => num(r.program_id)))];
  const orgIds = [...new Set(rows.map((r) => num(r.organization_id)))];
  // One small read per class (program and term), so a parent with several
  // classes never loses one class's next session or latest update to a
  // shared limit (Security & QA, #292). At most LIMIT classes.
  const pairs = [...new Map(rows.map((r) => [`${num(r.program_id)}:${num(r.term_id)}`, { programId: num(r.program_id), termId: num(r.term_id) }])).values()];
  const trialIds = rows.map((r) => r.trial_session_id).filter((id) => id != null).map(num);
  const SESSION_COLUMNS = "id,program_id,term_id,session_date,start_time,location,status";
  const [programs, orgs, trials, ...perClass] = await Promise.all([
    db.from("programs").select("id,name,location,location_note,end_time").in("id", programIds),
    db.from("organizations").select("id,name,slug,primary_category,website_url").in("id", orgIds),
    trialIds.length ? db.from("sessions").select(SESSION_COLUMNS).in("id", trialIds).gte("session_date", today) : Promise.resolve({ data: [] as Row[], error: null }),
    ...pairs.flatMap(({ programId, termId }) => [
      db.from("sessions").select(SESSION_COLUMNS).eq("program_id", programId).eq("term_id", termId).eq("status", "scheduled").gte("session_date", today).order("session_date", { ascending: true }).order("start_time", { ascending: true }).limit(1),
      db.from("class_posts").select("program_id,term_id,body,author_name,created_at").eq("program_id", programId).eq("term_id", termId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1),
    ]),
  ]);
  for (const read of [programs, orgs, trials, ...perClass]) throwIfSupabaseError(read.error, "Could not read this week's classes");
  const sessions = { data: [...((trials.data ?? []) as Row[]), ...perClass.filter((_, i) => i % 2 === 0).flatMap((read) => (read.data ?? []) as Row[])] };
  const posts = { data: perClass.filter((_, i) => i % 2 === 1).flatMap((read) => (read.data ?? []) as Row[]) };

  const businesses: HomeBusinessRow[] = ((orgs.data ?? []) as Row[]).map((o) => ({ id: num(o.id), name: str(o.name), slug: str(o.slug) || null, category: str(o.primary_category) || null, websiteUrl: str(o.website_url) || null }));
  return buildThisWeek({
    today,
    registrations: rows.map((r) => ({
      reference: str(r.reference_code),
      organizationId: num(r.organization_id),
      programId: num(r.program_id),
      termId: num(r.term_id),
      childName: str(r.child_name),
      status: str(r.registration_status),
      paymentStatus: str(r.payment_status),
      amountDueCents: r.amount_due_cents == null ? null : num(r.amount_due_cents),
      trialSessionId: r.trial_session_id == null ? null : num(r.trial_session_id),
    })),
    programs: ((programs.data ?? []) as Row[]).map((p) => ({ id: num(p.id), name: str(p.name), location: str(p.location) || null, locationNote: str(p.location_note) || null, endTime: str(p.end_time) || null })),
    sessions: ((sessions.data ?? []) as Row[]).map((s) => ({ id: num(s.id), programId: num(s.program_id), termId: num(s.term_id), date: str(s.session_date), startTime: str(s.start_time) || null, location: str(s.location) || null, status: str(s.status) })),
    posts: ((posts.data ?? []) as Row[]).map((p) => ({ programId: num(p.program_id), termId: num(p.term_id), body: str(p.body), authorName: str(p.author_name), createdAt: str(p.created_at) })),
    businesses,
    // Futprep's families look a registration up by its reference there.
    statusHref: (business) => (business?.slug === "futprep" ? "/futprep/my" : null),
  });
}
