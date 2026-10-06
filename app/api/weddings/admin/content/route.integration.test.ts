import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The WeddingWire widgets as structured data (security review of PR #183),
// against CI's local Supabase stack: what migration 202610190002 made of the
// snippets 202609241015 stored, that the database takes no HTML any more,
// and the Wedding Desk's save route end to end with a TEST Desk account.
// The PIN is drawn at random each run and never written anywhere but here.
//
// The route reads the staff cookie through next/headers, which only exists
// inside a Next request; a tiny in-memory jar stands in for it.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

import { POST } from "./route";
import { createWeddingStaffAccount, makeWeddingStaffToken, WEDDING_STAFF_COOKIE } from "@/app/weddings/staff-auth";
import { weddingWireSnippet } from "@/lib/weddingWire";

// This changes Bahamas Weddings By The Sea's own settings row (and puts it
// back), so it runs against a local stack only, never the shared database.
const supabaseHost = (() => {
  try {
    return new URL(process.env.SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost"].includes(supabaseHost)) throw new Error("Refusing to run: SUPABASE_URL is not a local Supabase stack.");

const db = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = Date.now().toString(36);
const ACCOUNT = `test-delete-desk-${TAG}`;
const pin = String(randomInt(100000, 999999));
const COLUMNS = "review_count,review_recommend_pct,years_experience,award_years,weddingwire_member_id,show_rating_badge,show_award_badge,show_reviews_widget";

let staffId = 0;
let token = "";
let original: Record<string, unknown> | null = null;

const GOOD = {
  reviewCount: 100,
  reviewRecommendPct: 100,
  yearsExperience: 26,
  awardYears: [2026, 2023, 2022, 2021, 2020, 2019],
  weddingWireMemberId: "946150",
  showRatingBadge: true,
  showAwardBadge: true,
  showReviews: true,
};

const save = (body: unknown) =>
  POST(new Request("http://localhost/api/weddings/admin/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const row = async () => {
  const { data, error } = await db().from("wedding_site_settings").select(COLUMNS).eq("id", 1).single();
  if (error) throw new Error(`could not read the settings row: ${error.message}`);
  return data as unknown as Record<string, unknown>;
};

const builtHtml = async () => {
  const { data, error } = await db().from("wedding_site_settings").select("rating_badge_html,award_badge_html,reviews_widget_html").eq("id", 1).single();
  if (error) throw new Error(`could not read the read-only columns: ${error.message}`);
  return data as { rating_badge_html: string | null; award_badge_html: string | null; reviews_widget_html: string | null };
};

// The snippets as 202609241015 stored them: one SQL literal per column.
function storedBy202609241015(column: string): string {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/202609241015_wedding_site_weddingwire_widgets.sql"), "utf8");
  const match = sql.match(new RegExp(`${column} = '((?:[^']|'')*)'`));
  if (!match) throw new Error(`${column} is not in 202609241015`);
  return match[1].replace(/''/g, "'");
}

beforeAll(async () => {
  original = await row();
  const account = await createWeddingStaffAccount({ name: `TEST — delete ${TAG}`, accountKey: ACCOUNT, role: "wedding_desk", pin });
  staffId = account.id;
  token = (await makeWeddingStaffToken(ACCOUNT, pin)) ?? "";
  if (!token) throw new Error("could not sign the TEST Desk account in");
  jar.set(WEDDING_STAFF_COOKIE, token);
});

afterAll(async () => {
  await db().from("audit_log").delete().eq("action", "wedding_site.updated").eq("after->>by", `desk:${ACCOUNT}`);
  if (staffId) await db().from("staff_members").delete().eq("id", staffId);
  // The row is shared by every test file after this one: a restore that
  // fails must fail this file, not pass quietly.
  if (original) {
    const { error } = await db()
      .from("wedding_site_settings")
      .update({ ...original, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(`could not put the settings row back: ${error.message}`);
    expect(await row()).toEqual(original);
  }
});

describe("the WeddingWire widgets as a member ID and three switches", () => {
  it("came across from the stored snippets: Antonio's member ID, all three shown", async () => {
    expect(await row()).toMatchObject({ weddingwire_member_id: "946150", show_rating_badge: true, show_award_badge: true, show_reviews_widget: true });
  });

  it("build, in the database's read-only columns, exactly the embed code that was stored", async () => {
    const html = await builtHtml();
    expect(html.rating_badge_html).toBe(storedBy202609241015("rating_badge_html"));
    expect(html.award_badge_html).toBe(storedBy202609241015("award_badge_html"));
    expect(html.reviews_widget_html).toBe(storedBy202609241015("reviews_widget_html"));
    // ...which is what the page now builds in code from the member ID.
    expect(html.rating_badge_html).toBe(weddingWireSnippet("rating", "946150"));
    expect(html.award_badge_html).toBe(weddingWireSnippet("award", "946150"));
    expect(html.reviews_widget_html).toBe(weddingWireSnippet("reviews", "946150"));
  });

  it("can't be given HTML or anything but digits, whoever writes to the database", async () => {
    for (const column of ["reviews_widget_html", "rating_badge_html", "award_badge_html"]) {
      const { error } = await db().from("wedding_site_settings").update({ [column]: "<script>fetch('/api/admin/people')</script>" }).eq("id", 1);
      expect(error?.code, column).toBe("428C9");
    }
    for (const memberId of ["946150');alert(1);//", "0946150", "abc", ""]) {
      const { error } = await db().from("wedding_site_settings").update({ weddingwire_member_id: memberId }).eq("id", 1);
      expect(error?.code, memberId).toBe("23514");
    }
    const { error } = await db().from("wedding_site_settings").update({ weddingwire_member_id: null }).eq("id", 1);
    expect(error?.code, "a widget shown with no member ID").toBe("23514");
    expect(await row()).toMatchObject({ weddingwire_member_id: "946150" });
  });
});

describe("POST /api/weddings/admin/content", () => {
  it("is refused without a Desk sign-in", async () => {
    jar.delete(WEDDING_STAFF_COOKIE);
    try {
      expect((await save(GOOD)).status).toBe(401);
    } finally {
      jar.set(WEDDING_STAFF_COOKIE, token);
    }
  });

  it("saves the numbers and the switches, and the audit log says what changed and which account changed it", async () => {
    const response = await save({ ...GOOD, reviewCount: 101, showReviews: false });
    expect(response.status).toBe(200);
    const answer = await response.json();
    expect(answer.settings).toMatchObject({ reviewCount: 101, weddingWire: { memberId: "946150", ratingBadge: true, awardBadge: true, reviews: false } });
    expect(await row()).toMatchObject({ review_count: 101, show_reviews_widget: false, show_rating_badge: true });
    expect((await builtHtml()).reviews_widget_html).toBeNull();

    const { data: org } = await db().from("organizations").select("id").eq("slug", "bahamas-weddings").single();
    const { data: entries } = await db()
      .from("audit_log")
      .select("organization_id,action,target_table,target_id,before,after")
      .eq("action", "wedding_site.updated")
      .eq("after->>by", `desk:${ACCOUNT}`);
    expect(entries).toHaveLength(1);
    expect(entries![0]).toEqual({
      organization_id: Number(org!.id),
      action: "wedding_site.updated",
      target_table: "wedding_site_settings",
      target_id: "1",
      before: { reviewCount: 100, showReviews: true },
      after: { reviewCount: 101, showReviews: false, by: `desk:${ACCOUNT}` },
    });
  });

  it("refuses HTML, and changes nothing", async () => {
    const before = await row();
    for (const field of ["reviewsWidgetHtml", "ratingBadgeHtml", "awardBadgeHtml"]) {
      const response = await save({ ...GOOD, [field]: "<script>fetch('/api/admin/people')</script>" });
      expect(response.status, field).toBe(400);
      expect((await response.json()).unknownFields).toEqual([field]);
    }
    for (const memberId of ["946150');alert(1);//", "<img src=x onerror=alert(1)>", "0946150"]) {
      expect((await save({ ...GOOD, weddingWireMemberId: memberId })).status, memberId).toBe(400);
    }
    expect(await row()).toEqual(before);
  });

  it("says so when a widget is switched on with no member ID", async () => {
    const response = await save({ ...GOOD, weddingWireMemberId: "" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/member ID/);
  });

  it("can switch every widget off and clear the member ID, then put them back", async () => {
    const off = await save({ ...GOOD, weddingWireMemberId: "", showRatingBadge: false, showAwardBadge: false, showReviews: false });
    expect(off.status).toBe(200);
    expect(await row()).toMatchObject({ weddingwire_member_id: null, show_rating_badge: false, show_award_badge: false, show_reviews_widget: false });
    expect(await builtHtml()).toEqual({ rating_badge_html: null, award_badge_html: null, reviews_widget_html: null });

    expect((await save(GOOD)).status).toBe(200);
    expect(await builtHtml()).toEqual({
      rating_badge_html: weddingWireSnippet("rating", "946150"),
      award_badge_html: weddingWireSnippet("award", "946150"),
      reviews_widget_html: weddingWireSnippet("reviews", "946150"),
    });
  });
});
