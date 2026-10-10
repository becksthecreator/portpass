import { randomBytes } from "node:crypto";
import { redactHealthAll } from "@/lib/health";
import { logAudit } from "./audit";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// A business's data, as one JSON file behind a signed link (Brief 21, part
// H 2; the Data Protection Act's right to a copy). Everything PortPass
// holds that belongs to the business: its page, offers, programmes, the
// registrations, bookings, payment requests and payments made with it, its
// team, perks, the emails PortPass sent on its behalf and the audit entries
// about it.
//
// What is left out, and why:
//  - children's health, allergy, medication, emergency and pickup fields
//    (CLAUDE.md rule 3: never in an export; lib/health.ts), and the
//    registration edit history, which can hold earlier versions of them;
//  - staff PIN hashes, invitation and claim tokens, a customer's booking
//    link token: none is the business's data, each is a key;
//  - PortPass's own books about the business (billing, invoices, receipts,
//    commission plans): those are PortPass's records, sent as invoices.
//
// The file lives in the private "exports" bucket (202610180004); the link
// works for 24 hours; the daily job removes files older than 7 days. Every
// export is in the audit log with who asked and how big it was.

export const EXPORTS_BUCKET = "exports";
export const EXPORT_LINK_SECONDS = 24 * 3600;
export const EXPORT_KEPT_DAYS = 7;

const PAGE = 1000;
// staff_note (brief 27, A): a programme's staff-only note stays on the
// staff screen, as its migration promises.
const STRIP = new Set(["pin_hash", "token", "token_hash", "public_token", "invite_token", "staff_note"]);

type Row = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (q: any) => any;

// Every row, a page at a time (PostgREST answers at most 1,000 per call).
// Typed loosely on purpose: supabase-js query builders are hard to name.
async function fetchAll(table: string, apply: Filter): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const query = apply(getSupabaseAdmin().from(table).select("*").order("id", { ascending: true }).range(from, from + PAGE - 1));
    const { data, error } = await query;
    throwIfSupabaseError(error, `Could not read ${table} for the export`);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !STRIP.has(key))));
}

const byOrg = (orgId: number): Filter => (q) => q.eq("organization_id", orgId);
const byIds = (column: string, ids: unknown[]): Filter => (q) => (ids.length ? q.in(column, ids) : q.eq(column, -1));

export type BusinessExport = { path: string; url: string; expiresAt: string; bytes: number; tables: Record<string, number> };

export async function exportBusinessData(orgId: number, actorUserId: string, now: Date = new Date()): Promise<BusinessExport> {
  const db = getSupabaseAdmin();
  const { data: organization, error: orgError } = await db.from("organizations").select("*").eq("id", orgId).maybeSingle();
  throwIfSupabaseError(orgError, "Could not read the business");
  if (!organization) throw new Error("NOT_FOUND");

  const sections: Record<string, Row[]> = {};
  sections.organization = [organization as Row];
  for (const table of ["offerings", "organization_faqs", "organization_images", "organization_categories", "locations", "programs", "booking_requests", "payment_requests", "staff_members", "organization_members", "organization_invites", "member_perks", "perk_redemptions", "message_log", "audit_log", "reservations", "products", "drops", "drop_waitlist", "shops", "private_session_requests", "coach_profiles", "organization_payment_settings", "page_events"]) {
    sections[table] = await fetchAll(table, byOrg(orgId));
  }
  const programIds = sections.programs.map((p) => p.id);
  sections.program_terms = await fetchAll("program_terms", byIds("program_id", programIds));
  sections.sessions = await fetchAll("sessions", byIds("program_id", programIds));
  sections.registrations = redactHealthAll(await fetchAll("registrations", byOrg(orgId)));
  const registrationIds = sections.registrations.map((r) => r.id);
  sections.payments = await fetchAll("payments", byIds("registration_id", registrationIds));
  sections.attendance = await fetchAll("attendance", byIds("session_id", sections.sessions.map((s) => s.id)));
  sections.product_variants = await fetchAll("product_variants", byIds("product_id", sections.products.map((p) => p.id)));
  sections.drop_items = await fetchAll("drop_items", byIds("drop_id", sections.drops.map((d) => d.id)));

  const tables = Object.fromEntries(Object.entries(sections).map(([name, rows]) => [name, rows.length]));
  const file = {
    exported_at: now.toISOString(),
    business: { id: orgId, name: (organization as Row).name, slug: (organization as Row).slug },
    note: "Everything PortPass holds for this business, except children's health, allergy, medication, emergency-contact and pickup details (never exported), staff PIN hashes and link tokens (keys, not data), and PortPass's own billing records (sent as invoices).",
    tables,
    data: sections,
  };
  const body = Buffer.from(JSON.stringify(file, null, 2), "utf8");
  const path = `org/${orgId}/${now.toISOString().slice(0, 10)}-${randomBytes(12).toString("hex")}.json`;
  const storage = db.storage.from(EXPORTS_BUCKET);
  const { error: uploadError } = await storage.upload(path, body, { contentType: "application/json", upsert: false });
  throwIfSupabaseError(uploadError, "Could not store the export");
  const { data: signed, error: signError } = await storage.createSignedUrl(path, EXPORT_LINK_SECONDS);
  throwIfSupabaseError(signError, "Could not make the export link");
  if (!signed?.signedUrl) throw new Error("Could not make the export link");
  const expiresAt = new Date(now.getTime() + EXPORT_LINK_SECONDS * 1000).toISOString();
  await logAudit({ actorUserId, organizationId: orgId, action: "business.exported", targetTable: "organizations", targetId: orgId, after: { bytes: body.length, tables, expires_at: expiresAt } });
  return { path, url: signed.signedUrl, expiresAt, bytes: body.length, tables };
}

// Files older than EXPORT_KEPT_DAYS go; called by the daily job.
export async function pruneExports(now: Date = new Date()): Promise<number> {
  const storage = getSupabaseAdmin().storage.from(EXPORTS_BUCKET);
  const cutoff = now.getTime() - EXPORT_KEPT_DAYS * 24 * 3600_000;
  const { data: folders, error } = await storage.list("org", { limit: 1000 });
  if (error) {
    // No bucket here (a stack with storage off) is not a failure of the job.
    console.warn("exports prune: could not list", error.message);
    return 0;
  }
  let removed = 0;
  for (const folder of folders ?? []) {
    const { data: files } = await storage.list(`org/${folder.name}`, { limit: 1000 });
    const old = (files ?? []).filter((f) => f.created_at && Date.parse(f.created_at) < cutoff).map((f) => `org/${folder.name}/${f.name}`);
    if (old.length) {
      const { error: removeError } = await storage.remove(old);
      if (!removeError) removed += old.length;
    }
  }
  return removed;
}
