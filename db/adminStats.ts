import { countMessageProblems, countSiteErrors, databaseChecks, getBackupHeartbeat, type BackupHeartbeat, type DatabaseCheck } from "./adminHealth";
import { getBillingOverview } from "./billing";
import { listSections } from "./categories";
import { listUnmarkedAttendance, type UnmarkedSession } from "./growth";
import { liveCountsByCategory } from "./organizations";
import { getSupabaseAdmin } from "./supabase";

// The Admin Control Center's first screen (28 Sept brief, 1.1): what needs
// attention, what happened this week, and the shape of the platform --
// every number straight from the database, none derived from a cache.
// The health tiles read db/adminHealth.ts.
//
// Resilience (quick fixes, 29 Sept): a tile that cannot be counted shows
// "—" (null) and logs which one failed; it never takes the page down. The
// 29 Sept outage was one missing column (registrations.created_at) turning
// the whole Overview into a 500.
export type AdminOverview = {
  needsAction: { businessesAwaiting: number | null; newApplications: number | null; unansweredLeads: number | null };
  thisWeek: { signUps: number | null; businesses: number | null; registrations: number | null; paymentsCount: number | null; paymentsCents: number | null; leads: number | null };
  platform: { sections: { slug: string; name: string; live: number }[]; totalListings: number | null; liveListings: number | null; accounts: number | null };
  // Sessions whose attendance was never marked (from noon on the day).
  attendance: UnmarkedSession[] | null;
  // Emails that failed, bounced or were marked as spam in the last 7 days;
  // server errors in the last 24 hours; the last backup to report in
  // (null: none yet; undefined: could not be read); the database's checks.
  // PortPass's own billing: drafts to send, overdue invoices, and the morning line.
  billing: { drafts: number; overdue: number; founderCalls: number; morning: string } | null;
  health: { emailProblems: number | null; siteErrors: number | null; backup: BackupHeartbeat | null | undefined; databaseChecks: DatabaseCheck[] | null };
  since: string;
};

type CountFilter = { eq?: [string, string | boolean]; in?: [string, string[]]; gte?: [string, string] };

// Every table/column pair a tile filters on, in one place, so a test can
// prove each column exists before a deploy rather than a 500 after it.
export const ADMIN_COUNT_COLUMNS: { table: string; column: string }[] = [
  { table: "organizations", column: "status" },
  { table: "organizations", column: "created_at" },
  { table: "organizations", column: "is_published" },
  { table: "applications", column: "status" },
  { table: "wedding_leads", column: "status" },
  { table: "wedding_leads", column: "created_at" },
  { table: "profiles", column: "created_at" },
  { table: "registrations", column: "created_at" },
  { table: "payments", column: "status" },
  { table: "payments", column: "created_at" },
  { table: "payments", column: "amount_cents" },
  { table: "message_log", column: "status" },
  { table: "site_errors", column: "created_at" },
];

async function countRows(table: string, filter: CountFilter): Promise<number> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter.eq) query = query.eq(filter.eq[0], filter.eq[1]);
  if (filter.in) query = query.in(filter.in[0], filter.in[1]);
  if (filter.gte) query = query.gte(filter.gte[0], filter.gte[1]);
  const { count, error } = await query;
  if (error) throw Object.assign(new Error(error.message || "count failed"), { code: error.code, details: error.details });
  return count ?? 0;
}

// One tile, never the page: a failed count logs the tile and yields null.
async function tile<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`admin overview tile failed: ${name}`, error instanceof Error ? { message: error.message, code: (error as { code?: string }).code } : error);
    return null;
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [businessesAwaiting, newApplications, unansweredLeads, signUps, businesses, registrations, leads, totalListings, liveListings, accounts, sections, live, payments, attendance, emailProblems, siteErrors, backup, checks, billing] = await Promise.all([
    tile("businesses awaiting approval", () => countRows("organizations", { eq: ["status", "submitted"] })),
    tile("new applications", () => countRows("applications", { eq: ["status", "submitted"] })),
    tile("unanswered wedding leads", () => countRows("wedding_leads", { eq: ["status", "new"] })),
    tile("new sign-ups", () => countRows("profiles", { gte: ["created_at", since] })),
    tile("new businesses", () => countRows("organizations", { gte: ["created_at", since] })),
    tile("registrations", () => countRows("registrations", { gte: ["created_at", since] })),
    tile("wedding leads", () => countRows("wedding_leads", { gte: ["created_at", since] })),
    tile("listings", () => countRows("organizations", { in: ["status", ["approved", "live"]] })),
    tile("live listings", () => countRows("organizations", { eq: ["is_published", true] })),
    tile("accounts", () => countRows("profiles", {})),
    tile("sections", () => listSections()),
    tile("live counts", () => liveCountsByCategory({ maxAgeMs: 0 })),
    tile("payments", async () => {
      const { data, error } = await supabase.from("payments").select("amount_cents").eq("status", "received").gte("created_at", since);
      if (error) throw Object.assign(new Error(error.message || "payments failed"), { code: error.code });
      return (data ?? []) as { amount_cents: number }[];
    }),
    tile("attendance not marked", () => listUnmarkedAttendance()),
    tile("email problems", () => countMessageProblems(since)),
    tile("site errors", () => countSiteErrors(day)),
    getBackupHeartbeat().catch((error) => {
      console.error("admin overview tile failed: backup heartbeat", error instanceof Error ? error.message : error);
      return undefined;
    }),
    tile("database checks", () => databaseChecks()),
    tile("billing", async () => {
      const overview = await getBillingOverview();
      return { drafts: overview.drafts.length, overdue: overview.open.filter((invoice) => invoice.status === "overdue").length, founderCalls: overview.founderCalls.length, morning: overview.morning };
    }),
  ]);

  return {
    needsAction: { businessesAwaiting, newApplications, unansweredLeads },
    thisWeek: {
      signUps,
      businesses,
      registrations,
      paymentsCount: payments ? payments.length : null,
      paymentsCents: payments ? payments.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0) : null,
      leads,
    },
    platform: {
      sections: (sections ?? []).map((s) => ({ slug: s.slug, name: s.name, live: live?.get(s.slug) ?? 0 })),
      totalListings,
      liveListings,
      accounts,
    },
    attendance,
    billing,
    health: { emailProblems, siteErrors, backup, databaseChecks: checks },
    since,
  };
}
