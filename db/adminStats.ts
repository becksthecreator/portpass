import { listSections } from "./categories";
import { liveCountsByCategory } from "./organizations";
import { getSupabaseAdmin, throwIfSupabaseError } from "./supabase";

// The Admin Control Center's first screen (28 Sept brief, 1.1): what needs
// attention, what happened this week, and the shape of the platform --
// every number straight from the database, none derived from a cache.
// Health tiles (deployment, runtime errors, backup heartbeat, advisor
// warnings) belong to build C and are not here yet.
export type AdminOverview = {
  needsAction: { businessesAwaiting: number; newApplications: number; unansweredLeads: number };
  thisWeek: { signUps: number; businesses: number; registrations: number; paymentsCount: number; paymentsCents: number; leads: number };
  platform: { sections: { slug: string; name: string; live: number }[]; totalListings: number; liveListings: number; accounts: number };
  since: string;
};

type CountFilter = { eq?: [string, string | boolean]; in?: [string, string[]]; gte?: [string, string] };

async function countRows(table: string, filter: CountFilter, what: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter.eq) query = query.eq(filter.eq[0], filter.eq[1]);
  if (filter.in) query = query.in(filter.in[0], filter.in[1]);
  if (filter.gte) query = query.gte(filter.gte[0], filter.gte[1]);
  const { count, error } = await query;
  throwIfSupabaseError(error, `Could not count ${what}`);
  return count ?? 0;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  const [businessesAwaiting, newApplications, unansweredLeads, signUps, businesses, registrations, leads, totalListings, liveListings, accounts, sections, live, payments] = await Promise.all([
    countRows("organizations", { eq: ["status", "submitted"] }, "businesses awaiting approval"),
    countRows("applications", { eq: ["status", "submitted"] }, "new applications"),
    countRows("wedding_leads", { eq: ["status", "new"] }, "unanswered wedding leads"),
    countRows("profiles", { gte: ["created_at", since] }, "new sign-ups"),
    countRows("organizations", { gte: ["created_at", since] }, "new businesses"),
    countRows("registrations", { gte: ["created_at", since] }, "registrations"),
    countRows("wedding_leads", { gte: ["created_at", since] }, "wedding leads"),
    countRows("organizations", { in: ["status", ["approved", "live"]] }, "listings"),
    countRows("organizations", { eq: ["is_published", true] }, "live listings"),
    countRows("profiles", {}, "accounts"),
    listSections(),
    liveCountsByCategory({ maxAgeMs: 0 }),
    supabase.from("payments").select("amount_cents").eq("status", "received").gte("created_at", since),
  ]);
  throwIfSupabaseError(payments.error, "Could not load payments");
  const paymentRows = (payments.data ?? []) as { amount_cents: number }[];

  return {
    needsAction: { businessesAwaiting, newApplications, unansweredLeads },
    thisWeek: {
      signUps,
      businesses,
      registrations,
      paymentsCount: paymentRows.length,
      paymentsCents: paymentRows.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0),
      leads,
    },
    platform: {
      sections: sections.map((s) => ({ slug: s.slug, name: s.name, live: live.get(s.slug) ?? 0 })),
      totalListings,
      liveListings,
      accounts,
    },
    since,
  };
}
