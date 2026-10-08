import { sendEmail } from "@/lib/email";
import { firstName, newRequestStaffEmail, requestDeclinedEmail, requestReceivedEmail, requestReferredEmail, type RequestFacts } from "@/lib/privateSessionEmails";
import { SITE_URL } from "@/lib/seo/jsonLd";
import { listOwnerEmails } from "./business";
import { logMessage } from "./growth";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// Who hears about a Futprep private-session request, and when (Brief 29,
// part A). On a new request: the preferred coach (or every bookable coach
// when none was chosen), Futprep's owner or admins, and the parent. On a
// decline or a referral: the parent. (On an accept: the parent, from
// db/coaches.ts, with how to pay.)
//
// Every send is one line in the Messages log, through lib/email.ts: who,
// which template, what became of it; never the text. A person with no email
// address on file is a "skipped" line that names them, so Admin -> Messages
// shows exactly who could not be reached. Nothing here ever throws into the
// request that caused it: a failed email is logged, and the request stands.

export const PORTAL_URL = `${SITE_URL}/futprep/staff/private-sessions`;

export const TEMPLATE = {
  parentReceived: "futprep_private_session_received",
  staffNew: "futprep_private_session_new",
  parentDeclined: "futprep_private_session_declined",
  parentReferred: "futprep_private_session_referred",
} as const;

type RequestRow = {
  id: number;
  organization_id: number;
  reference_code: string;
  preferred_coach_id: number | null;
  assigned_coach_id: number | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  child_name: string;
  child_age: number;
  requested_date: string;
  requested_start_time: string;
  duration_minutes: number;
  price_cents: number | null;
  service_slug: string | null;
  request_type: string;
  location_preference: string;
  session_goal: string;
};

export type CoachContact = { coachId: number; name: string; email: string | null };

// A coach's email lives on the staff login their profile is tied to
// (coach_profiles.staff_member_id -> staff_members.email). null when the
// profile has no login or the login has no address.
export async function coachContacts(coachIds: number[]): Promise<CoachContact[]> {
  if (coachIds.length === 0) return [];
  const db = getSupabaseAdmin();
  const { data: coaches, error } = await db.from("coach_profiles").select("id,display_name,staff_member_id").in("id", coachIds);
  throwIfSupabaseError(error, "Could not load the coaches");
  const staffIds = (coaches ?? []).map((c) => c.staff_member_id).filter((id): id is number => id !== null && id !== undefined);
  const emails = new Map<number, string | null>();
  if (staffIds.length) {
    const { data: staff, error: staffError } = await db.from("staff_members").select("id,email,active").in("id", staffIds);
    throwIfSupabaseError(staffError, "Could not load the coaches' logins");
    for (const row of staff ?? []) emails.set(Number(row.id), row.active && typeof row.email === "string" && row.email.includes("@") ? row.email.trim().toLowerCase() : null);
  }
  return (coaches ?? []).map((c) => ({ coachId: Number(c.id), name: String(c.display_name), email: c.staff_member_id ? (emails.get(Number(c.staff_member_id)) ?? null) : null }));
}

export async function bookableCoachIds(organizationId: number): Promise<number[]> {
  const { data, error } = await getSupabaseAdmin().from("coach_profiles").select("id").eq("organization_id", organizationId).eq("active", true).eq("bookable", true).eq("member_type", "coach");
  throwIfSupabaseError(error, "Could not load the bookable coaches");
  return (data ?? []).map((row) => Number(row.id));
}

// The business's owners with a PortPass account, plus the admin and CEO
// staff logins that have an address. Lower-cased and de-duplicated.
export async function ownerAndAdminEmails(organizationId: number): Promise<string[]> {
  const owners = await listOwnerEmails(organizationId).catch(() => [] as string[]);
  const { data, error } = await getSupabaseAdmin().from("staff_members").select("email").eq("organization_id", organizationId).eq("active", true).in("role", ["admin", "admin_registrar", "ceo"]);
  throwIfSupabaseError(error, "Could not load the admin logins");
  const all = [...owners, ...(data ?? []).map((row) => (typeof row.email === "string" ? row.email : ""))].map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
  return [...new Set(all)];
}

async function loadFacts(requestId: number): Promise<{ row: RequestRow; facts: RequestFacts } | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("private_session_requests").select("id,organization_id,reference_code,preferred_coach_id,assigned_coach_id,parent_name,parent_email,parent_phone,child_name,child_age,requested_date,requested_start_time,duration_minutes,price_cents,service_slug,request_type,location_preference,session_goal").eq("id", requestId).maybeSingle();
  throwIfSupabaseError(error, "Could not load the request");
  if (!data) return null;
  const row = data as RequestRow;
  const [coach, service] = await Promise.all([
    row.preferred_coach_id ? db.from("coach_profiles").select("display_name").eq("id", row.preferred_coach_id).maybeSingle() : Promise.resolve({ data: null }),
    row.service_slug ? db.from("offerings").select("name").eq("organization_id", row.organization_id).eq("slug", row.service_slug).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const facts: RequestFacts = {
    referenceCode: row.reference_code,
    serviceName: (service.data as { name?: string } | null)?.name ?? (row.request_type === "birthday" ? "Birthday session" : "Private session"),
    date: String(row.requested_date),
    startTime: String(row.requested_start_time),
    durationMinutes: Number(row.duration_minutes),
    priceCents: row.price_cents === null ? null : Number(row.price_cents),
    coachName: (coach.data as { display_name?: string } | null)?.display_name ?? null,
    parentName: row.parent_name,
    parentPhone: row.parent_phone,
    childFirstName: firstName(row.child_name),
    childAge: Number(row.child_age),
    locationPreference: row.location_preference ?? "",
    sessionGoal: row.session_goal ?? "",
  };
  return { row, facts };
}

const log = (organizationId: number, template: string, recipient: string, detail: string) => logMessage({ organizationId, template, recipient, status: "skipped", detail }).catch(() => {});

// A new request: the parent, the coach (or every bookable coach), the owner
// or admins. Returns how many emails were handed to the email service.
export async function notifyNewPrivateSessionRequest(requestId: number): Promise<number> {
  try {
    const loaded = await loadFacts(requestId);
    if (!loaded) return 0;
    const { row, facts } = loaded;
    const orgId = Number(row.organization_id);
    let sent = 0;
    const send = async (to: string, template: string, email: { subject: string; html: string }) => {
      const outcome = await sendEmail({ to, subject: email.subject, html: email.html, log: { template, organizationId: orgId } });
      if (outcome === "sent") sent += 1;
    };

    await send(row.parent_email, TEMPLATE.parentReceived, requestReceivedEmail(facts));

    const staffEmail = newRequestStaffEmail(facts, PORTAL_URL);
    const coachIds = row.preferred_coach_id ? [Number(row.preferred_coach_id)] : await bookableCoachIds(orgId);
    const contacts = await coachContacts(coachIds);
    const told = new Set<string>();
    for (const contact of contacts) {
      if (!contact.email) {
        await log(orgId, TEMPLATE.staffNew, contact.name, "No email address on this coach's staff account.");
        continue;
      }
      if (told.has(contact.email)) continue;
      told.add(contact.email);
      await send(contact.email, TEMPLATE.staffNew, staffEmail);
    }
    if (contacts.length === 0) await log(orgId, TEMPLATE.staffNew, "(no bookable coach)", "No bookable coach to tell.");

    const owners = (await ownerAndAdminEmails(orgId)).filter((email) => !told.has(email));
    if (owners.length === 0) await log(orgId, TEMPLATE.staffNew, "(no owner on file)", "No owner with a PortPass account, and no admin or CEO login with an email address.");
    for (const email of owners) await send(email, TEMPLATE.staffNew, staffEmail);
    return sent;
  } catch (error) {
    console.error("private session: new-request emails", error instanceof Error ? error.message : "");
    return 0;
  }
}

// The parent, when a coach declines or refers.
export async function notifyParentOfDecision(requestId: number, decision: { action: "declined"; reason: string } | { action: "referred"; newCoachName: string; note: string }): Promise<void> {
  try {
    const loaded = await loadFacts(requestId);
    if (!loaded) return;
    const { row, facts } = loaded;
    const email = decision.action === "declined" ? requestDeclinedEmail(facts, decision.reason) : requestReferredEmail(facts, decision.newCoachName, decision.note);
    await sendEmail({ to: row.parent_email, subject: email.subject, html: email.html, log: { template: decision.action === "declined" ? TEMPLATE.parentDeclined : TEMPLATE.parentReferred, organizationId: Number(row.organization_id) } });
  } catch (error) {
    console.error("private session: decision email", error instanceof Error ? error.message : "");
  }
}
