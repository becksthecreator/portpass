// Admin -> Phase 1 (brief 19, part F): what is in place and what is left,
// worked out from live state so nobody has to ask. Pure: db/phase1.ts
// gathers the facts and this turns them into ticks and crosses.
//
// A setting is only ever reported as set or not set, by its NAME. No
// value, no part of a value and no length is read into anything shown.
import { missingItems, type ChecklistItem } from "./pageChecklist";

export const CARV_SLUG = "carv-performance";
export const BACKUP_SEEN_DAYS = 7;
export const SIGN_IN_SEEN_HOURS = 24;
// The demo resets in the daily job, so two days without one means the job
// has missed a night.
export const DEMO_RESET_HOURS = 48;

// The settings the Scout (Admin -> Leads) needs, by name.
export const SCOUT_SETTINGS = ["GOOGLE_PLACES_API_KEY", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_GRAPH_ACCESS_TOKEN", "ANTHROPIC_API_KEY"] as const;

export type Phase1Facts = {
  // Which named settings are set (true) or not, never their values.
  settings: Record<string, boolean>;
  // null: no backup has ever reported in. undefined: it couldn't be read.
  backup: { at: string; ok: boolean } | null | undefined;
  // When an emailed sign-in code was last typed in correctly: proof the
  // email was delivered. null: never recorded.
  signInCodeUsedAt: string | null | undefined;
  businesses: { organizationId: number; slug: string; name: string; status: string; isPublished: boolean; items: ChecklistItem[] }[] | undefined;
  livePerks: number | undefined;
  publishedGuides: number | undefined;
  carv: { status: string; isPublished: boolean } | null | undefined;
  demoResetAt: string | null | undefined;
};

export type Phase1Check = {
  key: string;
  group: "Settings" | "Running" | "Businesses" | "Content";
  label: string;
  ok: boolean;
  detail: string;
  // Where to look or fix it.
  href?: string;
  // For a business: what its page is missing, each with its link.
  missing?: { label: string; href: string }[];
};

const UNREADABLE = "Could not be read just now. Refresh to try again.";

export function settingsSet(env: Record<string, string | undefined>, names: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(names.map((name) => [name, Boolean(env[name]?.trim())]));
}

function ago(iso: string, now: Date): string {
  const hours = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 3_600_000));
  if (Number.isNaN(hours)) return "at a time that couldn't be read";
  if (hours < 1) return "less than an hour ago";
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
}

function within(iso: string | null | undefined, hours: number, now: Date): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return !Number.isNaN(at) && now.getTime() - at <= hours * 3_600_000;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function phase1Checks(facts: Phase1Facts, now: Date): Phase1Check[] {
  const checks: Phase1Check[] = [];

  // ---- settings, by name ----
  const cron = facts.settings.CRON_SECRET === true;
  checks.push({
    key: "cron_secret",
    group: "Settings",
    label: "CRON_SECRET set",
    ok: cron,
    detail: cron ? "Set. The daily job, the monthly growth report and the Saturday attendance reminder can run." : "Not set. The daily job, the monthly growth report and the demo's nightly reset can't run until CRON_SECRET is added to the host's settings.",
    href: "/admin/settings",
  });
  const scoutMissing = SCOUT_SETTINGS.filter((name) => facts.settings[name] !== true);
  checks.push({
    key: "scout_keys",
    group: "Settings",
    label: "Scout keys set",
    ok: scoutMissing.length === 0,
    detail: scoutMissing.length === 0 ? `All ${SCOUT_SETTINGS.length} are set: Admin, Leads can search, look up and summarise.` : `Not set: ${scoutMissing.join(", ")}.`,
    href: "/admin/settings",
  });

  // ---- running ----
  const backupFresh = Boolean(facts.backup) && facts.backup!.ok && within(facts.backup!.at, BACKUP_SEEN_DAYS * 24, now);
  checks.push({
    key: "backup_heartbeat",
    group: "Running",
    label: `Backup heartbeat seen in the last ${BACKUP_SEEN_DAYS} days`,
    ok: backupFresh,
    detail:
      facts.backup === undefined
        ? UNREADABLE
        : facts.backup === null
          ? "No backup has ever reported in."
          : !facts.backup.ok
            ? `The last backup reported a failure, ${ago(facts.backup.at, now)}.`
            : backupFresh
              ? `Last heard from ${ago(facts.backup.at, now)}.`
              : `Last heard from ${ago(facts.backup.at, now)}: more than ${BACKUP_SEEN_DAYS} days.`,
    href: "/admin/health",
  });
  const signInFresh = within(facts.signInCodeUsedAt, SIGN_IN_SEEN_HOURS, now);
  checks.push({
    key: "sign_in_email",
    group: "Running",
    label: `Sign-in email delivered in the last ${SIGN_IN_SEEN_HOURS} hours`,
    ok: signInFresh,
    detail:
      facts.signInCodeUsedAt === undefined
        ? UNREADABLE
        : !facts.signInCodeUsedAt
          ? "No emailed sign-in code has been used since this check was added. Sign in with an email code to test it."
          : signInFresh
            ? `Someone signed in with an emailed code ${ago(facts.signInCodeUsedAt, now)}, so the email arrived.`
            : `The last emailed code was used ${ago(facts.signInCodeUsedAt, now)}. Sign in with an email code to check it still arrives.`,
    href: "/login",
  });
  const demoFresh = within(facts.demoResetAt, DEMO_RESET_HOURS, now);
  checks.push({
    key: "demo_reset",
    group: "Running",
    label: "Demo reset last ran",
    ok: demoFresh,
    detail: facts.demoResetAt === undefined ? UNREADABLE : !facts.demoResetAt ? "The demo has never been reset." : demoFresh ? `Last reset ${ago(facts.demoResetAt, now)}.` : `Last reset ${ago(facts.demoResetAt, now)}: the nightly reset has missed a night.`,
    href: "/demo",
  });

  // ---- businesses ----
  if (facts.businesses === undefined) {
    checks.push({ key: "businesses", group: "Businesses", label: "Each live business's page", ok: false, detail: UNREADABLE, href: "/admin/businesses#missing" });
  } else {
    const live = facts.businesses.filter((business) => business.status === "live" && business.isPublished);
    if (live.length === 0) checks.push({ key: "businesses", group: "Businesses", label: "Each live business's page", ok: false, detail: "No business is live yet.", href: "/admin/businesses" });
    for (const business of live) {
      const missing = missingItems(business.items);
      checks.push({
        key: `business_${business.organizationId}`,
        group: "Businesses",
        label: `${business.name}: page complete`,
        ok: missing.length === 0,
        detail: missing.length === 0 ? `All ${business.items.length} items are in place.` : `${count(missing.length, "item", "items")} missing:`,
        href: `/business/${business.slug}`,
        missing: missing.map((item) => ({ label: item.label, href: item.href })),
      });
    }
  }
  checks.push({
    key: "carv_published",
    group: "Businesses",
    label: "Carv published",
    ok: Boolean(facts.carv?.isPublished),
    detail: facts.carv === undefined ? UNREADABLE : facts.carv === null ? "Carv Performance isn't in the database." : facts.carv.isPublished ? "Carv Performance's page is public." : `Not yet: its page is ${facts.carv.status} and not public. The owner presses Publish on the business home.`,
    href: `/business/${CARV_SLUG}`,
  });

  // ---- content ----
  checks.push({
    key: "perks",
    group: "Content",
    label: "Perks offered",
    ok: (facts.livePerks ?? 0) > 0,
    detail: facts.livePerks === undefined ? UNREADABLE : facts.livePerks === 0 ? "No business has a live member perk yet." : `${count(facts.livePerks, "perk is", "perks are")} live.`,
    href: "/admin/perks",
  });
  checks.push({
    key: "guides",
    group: "Content",
    label: "Guides published",
    ok: (facts.publishedGuides ?? 0) > 0,
    detail: facts.publishedGuides === undefined ? UNREADABLE : facts.publishedGuides === 0 ? "No guide is published yet." : `${count(facts.publishedGuides, "guide is", "guides are")} published.`,
    href: "/admin/guides",
  });

  return checks;
}

export const PHASE1_GROUPS: Phase1Check["group"][] = ["Settings", "Running", "Businesses", "Content"];

export function phase1Summary(checks: Phase1Check[]): string {
  const ok = checks.filter((check) => check.ok).length;
  return ok === checks.length ? `All ${checks.length} in place.` : `${ok} of ${checks.length} in place, ${checks.length - ok} left.`;
}
