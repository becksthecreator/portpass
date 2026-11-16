import { classLabel, FEED_STATUSES } from "@/lib/classFeed";
import { nassauToday } from "@/lib/futprepTerms";
import { futprepOrganizationId } from "./programs";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The class feed (Nov 2026): posts by Futprep's coaches and admins to one
// class in one term, read by that class's parents.
//
// What is read of a registration here is the class, the parent's email and
// the child's first name. Never a health, allergy, medication, emergency
// or pickup column (rule 3, lib/health.static.test.ts).

type Row = Record<string, unknown>;

export type FeedClass = {
  programId: number;
  termId: number;
  programName: string;
  termName: string;
  startDate: string;
  endDate: string;
  families: number;
};

export type ClassPost = {
  id: number;
  programId: number;
  termId: number;
  body: string;
  authorName: string;
  emailedCount: number;
  createdAt: string;
};

export type ParentFeedClass = {
  programId: number;
  termId: number;
  programName: string;
  termName: string;
  children: string[];
};

export type ParentFeed = { classes: ParentFeedClass[]; posts: (ClassPost & { classLabel: string })[] };

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const firstName = (name: unknown): string => text(name).trim().split(/\s+/)[0] ?? "";
const pairKey = (programId: number, termId: number) => `${programId}:${termId}`;

// An exact, case-insensitive match for ilike: the wildcard characters an
// address may contain are escaped, so "a_b@x.com" never matches "acb@x.com".
function exactEmail(email: string): string {
  return email.trim().toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toPost(row: Row): ClassPost {
  return {
    id: Number(row.id),
    programId: Number(row.program_id),
    termId: Number(row.term_id),
    body: text(row.body),
    authorName: text(row.author_name),
    emailedCount: Number(row.emailed_count ?? 0),
    createdAt: text(row.created_at),
  };
}

const POST_COLUMNS = "id,program_id,term_id,body,author_name,emailed_count,created_at";

// Every Futprep class staff can post to: active programmes, and their
// active terms that haven't been over for more than two weeks (the last
// "thanks for a great term" still goes to the right families).
export async function listFeedClasses(today = nassauToday()): Promise<FeedClass[]> {
  const db = getSupabaseAdmin();
  const org = await futprepOrganizationId();
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 14);

  const { data: programs, error } = await db.from("programs").select("id,name").eq("organization_id", org).eq("active", true);
  throwIfSupabaseError(error, "Could not load the classes");
  const programRows = (programs ?? []) as Row[];
  if (!programRows.length) return [];
  const programName = new Map(programRows.map((p) => [Number(p.id), text(p.name)]));

  const { data: terms, error: termError } = await db
    .from("program_terms")
    .select("id,program_id,name,start_date,end_date")
    .in("program_id", [...programName.keys()])
    .eq("active", true)
    .gte("end_date", cutoff.toISOString().slice(0, 10))
    .order("start_date");
  throwIfSupabaseError(termError, "Could not load the terms");
  const termRows = (terms ?? []) as Row[];
  if (!termRows.length) return [];

  const { data: regs, error: regError } = await db
    .from("registrations")
    .select("program_id,term_id,parent_email")
    .eq("organization_id", org)
    .in("term_id", termRows.map((t) => Number(t.id)))
    .in("registration_status", [...FEED_STATUSES]);
  throwIfSupabaseError(regError, "Could not count the families");
  const families = new Map<string, Set<string>>();
  for (const r of (regs ?? []) as Row[]) {
    const email = text(r.parent_email).trim().toLowerCase();
    if (!email) continue;
    const key = pairKey(Number(r.program_id), Number(r.term_id));
    if (!families.has(key)) families.set(key, new Set());
    families.get(key)!.add(email);
  }

  return termRows
    .map((t) => ({
      programId: Number(t.program_id),
      termId: Number(t.id),
      programName: programName.get(Number(t.program_id)) ?? "",
      termName: text(t.name),
      startDate: text(t.start_date),
      endDate: text(t.end_date),
      families: families.get(pairKey(Number(t.program_id), Number(t.id)))?.size ?? 0,
    }))
    .sort((a, b) => a.programName.localeCompare(b.programName) || a.startDate.localeCompare(b.startDate));
}

// The class and term, if both are Futprep's and belong together; null
// otherwise, so a post can never land on another business's class.
export async function findFeedClass(programId: number, termId: number): Promise<{ organizationId: number; programName: string; termName: string } | null> {
  if (!Number.isInteger(programId) || !Number.isInteger(termId)) return null;
  const db = getSupabaseAdmin();
  const org = await futprepOrganizationId();
  const [program, term] = await Promise.all([
    db.from("programs").select("id,name").eq("id", programId).eq("organization_id", org).maybeSingle(),
    db.from("program_terms").select("id,name").eq("id", termId).eq("program_id", programId).maybeSingle(),
  ]);
  throwIfSupabaseError(program.error, "Could not load the class");
  throwIfSupabaseError(term.error, "Could not load the term");
  if (!program.data || !term.data) return null;
  return { organizationId: org, programName: text(program.data.name), termName: text(term.data.name) };
}

export async function listClassPosts(programId: number, termId: number, limit = 30): Promise<ClassPost[]> {
  const org = await futprepOrganizationId();
  const { data, error } = await getSupabaseAdmin()
    .from("class_posts")
    .select(POST_COLUMNS)
    .eq("organization_id", org)
    .eq("program_id", programId)
    .eq("term_id", termId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIfSupabaseError(error, "Could not load the class updates");
  return ((data ?? []) as Row[]).map(toPost);
}

export async function createClassPost(input: { programId: number; termId: number; body: string; authorAccount: string; authorName: string }): Promise<ClassPost> {
  const found = await findFeedClass(input.programId, input.termId);
  if (!found) throw new Error("CLASS_NOT_FOUND");
  const { data, error } = await getSupabaseAdmin()
    .from("class_posts")
    .insert({
      organization_id: found.organizationId,
      program_id: input.programId,
      term_id: input.termId,
      body: input.body,
      author_account: input.authorAccount,
      author_name: input.authorName.slice(0, 120),
    })
    .select(POST_COLUMNS)
    .single();
  throwIfSupabaseError(error, "Could not save the update");
  return toPost(data as Row);
}

// One address per family, lower-cased: two children in one class are one
// email, not two.
export async function classRecipients(programId: number, termId: number): Promise<string[]> {
  const org = await futprepOrganizationId();
  const { data, error } = await getSupabaseAdmin()
    .from("registrations")
    .select("parent_email")
    .eq("organization_id", org)
    .eq("program_id", programId)
    .eq("term_id", termId)
    .in("registration_status", [...FEED_STATUSES]);
  throwIfSupabaseError(error, "Could not load the class's families");
  const emails = new Set<string>();
  for (const row of (data ?? []) as Row[]) {
    const email = text(row.parent_email).trim().toLowerCase();
    if (email.includes("@")) emails.add(email);
  }
  return [...emails].sort();
}

export async function recordEmailed(postId: number, count: number): Promise<void> {
  const { error } = await getSupabaseAdmin().from("class_posts").update({ emailed_count: count }).eq("id", postId);
  throwIfSupabaseError(error, "Could not record the emails");
}

// Hides a post from the feed. Returns false when there was nothing to hide.
export async function removeClassPost(postId: number, by: string): Promise<boolean> {
  if (!Number.isInteger(postId)) return false;
  const org = await futprepOrganizationId();
  const { data, error } = await getSupabaseAdmin()
    .from("class_posts")
    .update({ deleted_at: new Date().toISOString(), deleted_by: by })
    .eq("id", postId)
    .eq("organization_id", org)
    .is("deleted_at", null)
    .select("id");
  throwIfSupabaseError(error, "Could not remove the update");
  return ((data ?? []) as Row[]).length > 0;
}

// What a signed-in parent sees on /futprep/feed: each class a child of
// theirs is in (by the email the registration was made with, as /account
// does), and the updates posted to those classes, newest first.
export async function listParentFeed(email: string | null, limit = 50): Promise<ParentFeed> {
  if (!email || !email.includes("@") || /[*\s]/.test(email.trim())) return { classes: [], posts: [] };
  const db = getSupabaseAdmin();
  const org = await futprepOrganizationId();
  const { data: regs, error } = await db
    .from("registrations")
    .select("program_id,term_id,child_name")
    .eq("organization_id", org)
    .ilike("parent_email", exactEmail(email))
    .in("registration_status", [...FEED_STATUSES]);
  throwIfSupabaseError(error, "Could not load your classes");
  const regRows = (regs ?? []) as Row[];
  if (!regRows.length) return { classes: [], posts: [] };

  const children = new Map<string, Set<string>>();
  for (const r of regRows) {
    const key = pairKey(Number(r.program_id), Number(r.term_id));
    if (!children.has(key)) children.set(key, new Set());
    const name = firstName(r.child_name);
    if (name) children.get(key)!.add(name);
  }
  const programIds = [...new Set(regRows.map((r) => Number(r.program_id)))];
  const termIds = [...new Set(regRows.map((r) => Number(r.term_id)))];

  const [programs, terms, posts] = await Promise.all([
    db.from("programs").select("id,name").in("id", programIds),
    db.from("program_terms").select("id,name,start_date").in("id", termIds),
    db.from("class_posts").select(POST_COLUMNS).eq("organization_id", org).in("program_id", programIds).in("term_id", termIds).is("deleted_at", null).order("created_at", { ascending: false }).limit(limit * 2),
  ]);
  throwIfSupabaseError(programs.error, "Could not load your classes");
  throwIfSupabaseError(terms.error, "Could not load your terms");
  throwIfSupabaseError(posts.error, "Could not load the class updates");
  const programName = new Map(((programs.data ?? []) as Row[]).map((p) => [Number(p.id), text(p.name)]));
  const term = new Map(((terms.data ?? []) as Row[]).map((t) => [Number(t.id), { name: text(t.name), start: text(t.start_date) }]));

  const classes: ParentFeedClass[] = [...children.entries()]
    .map(([key, names]) => {
      const [programId, termId] = key.split(":").map(Number);
      return { programId, termId, programName: programName.get(programId) ?? "", termName: term.get(termId)?.name ?? "", children: [...names].sort() };
    })
    .sort((a, b) => (term.get(b.termId)?.start ?? "").localeCompare(term.get(a.termId)?.start ?? "") || a.programName.localeCompare(b.programName));

  const label = new Map(classes.map((c) => [pairKey(c.programId, c.termId), classLabel(c.programName, c.termName)]));
  // The query matched any programme with any term; keep only the real pairs.
  const feedPosts = ((posts.data ?? []) as Row[])
    .map(toPost)
    .filter((p) => label.has(pairKey(p.programId, p.termId)))
    .slice(0, limit)
    .map((p) => ({ ...p, classLabel: label.get(pairKey(p.programId, p.termId))! }));

  return { classes, posts: feedPosts };
}
