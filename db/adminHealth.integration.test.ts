import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { countMessageProblems, countSiteErrors, databaseChecks, getBackupHeartbeat, listMessages, listSiteErrors, markDelivery, pruneHealthRecords, recordSiteError, saveBackupHeartbeat } from "./adminHealth";
import { logMessage } from "./growth";

// Admin Control Center, build C (brief 08) against CI's local Supabase
// stack: the Messages log and what the email service reports back, site
// errors, the backup heartbeat, retention, and the database's own safety
// checks. Every row is TEST data and is removed afterwards.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = crypto.randomUUID().slice(0, 8);
const TEMPLATE = `test_template_${TAG}`;
const ROUTE = `/test-delete/${TAG}/[id]`;
const address = (label: string) => `test-delete-${label}-${TAG}@test.portpass.local`;
const provider = (n: number) => `${TAG}-0000-4000-8000-00000000000${n}`;

afterAll(async () => {
  await db.from("message_log").delete().eq("template", TEMPLATE);
  await db.from("site_errors").delete().eq("route", ROUTE);
  await db.from("site_content").delete().eq("key", "backup_heartbeat");
});

describe("the Messages log", () => {
  it("lists what was sent, and finds one address", async () => {
    await logMessage({ organizationId: null, template: TEMPLATE, recipient: address("one"), status: "sent", providerId: provider(1) });
    await logMessage({ organizationId: null, template: TEMPLATE, recipient: address("two"), status: "sent", providerId: provider(2) });
    await logMessage({ organizationId: null, template: TEMPLATE, recipient: address("three"), status: "failed", detail: "The email service refused it (422)." });
    const mine = (await listMessages({ template: TEMPLATE })).map((m) => [m.recipient, m.status]);
    expect(mine).toHaveLength(3);
    expect(mine).toContainEqual([address("three"), "failed"]);
    expect((await listMessages({ q: `  ${address("two").toUpperCase()} ` })).map((m) => m.recipient)).toEqual([address("two")]);
    expect((await listMessages({ status: "problems", template: TEMPLATE })).map((m) => m.recipient)).toEqual([address("three")]);
  });

  it("takes delivered and bounced from the email service, and a late 'delivered' never hides a bounce", async () => {
    await markDelivery(provider(1), "delivered", null);
    await markDelivery(provider(2), "bounced", "Bounced: Permanent.");
    await markDelivery(provider(2), "delivered", null);
    const byAddress = new Map((await listMessages({ template: TEMPLATE })).map((m) => [m.recipient, m]));
    expect(byAddress.get(address("one"))).toMatchObject({ status: "delivered", detail: null });
    expect(byAddress.get(address("two"))).toMatchObject({ status: "bounced", detail: "Bounced: Permanent." });
    // A report for an email PortPass never logged changes nothing.
    await markDelivery(`${TAG}-ffff-4000-8000-000000000000`, "bounced", "Bounced: Permanent.");
    expect((await listMessages({ template: TEMPLATE })).filter((m) => m.status === "bounced")).toHaveLength(1);
  });

  it("counts what did not arrive", async () => {
    const before = await countMessageProblems(new Date(Date.now() - 3600_000).toISOString());
    // This file's failed and bounced emails are in there.
    expect(before).toBeGreaterThanOrEqual(2);
    expect(await countMessageProblems(new Date(Date.now() + 3600_000).toISOString())).toBe(0);
  });
});

describe("site errors", () => {
  it("keeps the route, the kind and the digest, and nothing else", async () => {
    const hour = new Date(Date.now() - 3600_000).toISOString();
    const before = await countSiteErrors(hour);
    await recordSiteError({ route: ROUTE, routeType: "render", errorName: "TypeError", digest: "1234567890" });
    expect(await countSiteErrors(hour)).toBe(before + 1);
    const mine = (await listSiteErrors(500)).find((e) => e.route === ROUTE)!;
    expect(mine).toMatchObject({ route: ROUTE, routeType: "render", errorName: "TypeError", digest: "1234567890" });
    expect(Object.keys(mine).sort()).toEqual(["createdAt", "digest", "errorName", "id", "route", "routeType"]);
  });
});

describe("retention", () => {
  it("removes Messages log lines older than a year and site errors older than a month, and nothing newer", async () => {
    const old = new Date(Date.now() - 400 * 24 * 3600_000).toISOString();
    const recent = new Date(Date.now() - 20 * 24 * 3600_000).toISOString();
    await db.from("message_log").insert([{ template: TEMPLATE, recipient: address("old"), status: "sent", created_at: old }, { template: TEMPLATE, recipient: address("recent"), status: "sent", created_at: recent }]);
    await db.from("site_errors").insert([{ route: ROUTE, error_name: "TEST old", created_at: new Date(Date.now() - 40 * 24 * 3600_000).toISOString() }, { route: ROUTE, error_name: "TEST recent", created_at: recent }]);
    await pruneHealthRecords();
    const { data: messages } = await db.from("message_log").select("recipient").eq("template", TEMPLATE).in("recipient", [address("old"), address("recent")]);
    expect(messages!.map((m) => m.recipient)).toEqual([address("recent")]);
    const { data: errors } = await db.from("site_errors").select("error_name").eq("route", ROUTE).like("error_name", "TEST %");
    expect(errors!.map((e) => e.error_name)).toEqual(["TEST recent"]);
  });
});

describe("the backup heartbeat", () => {
  it("is empty until a backup reports in, then holds the latest report", async () => {
    await db.from("site_content").delete().eq("key", "backup_heartbeat");
    expect(await getBackupHeartbeat()).toBeNull();
    await saveBackupHeartbeat(true, new Date("2026-10-02T07:10:00Z"));
    expect(await getBackupHeartbeat()).toEqual({ at: "2026-10-02T07:10:00.000Z", ok: true });
    await saveBackupHeartbeat(false, new Date("2026-10-03T07:10:00Z"));
    expect(await getBackupHeartbeat()).toEqual({ at: "2026-10-03T07:10:00.000Z", ok: false });
  });
});

describe("the database's safety checks", () => {
  // This is also a guard on every future migration: a new table without
  // row level security, a function without a fixed search path, or a
  // privileged function a browser role may call fails here, before deploy.
  it("finds nothing wrong with the schema the migrations build", async () => {
    const checks = await databaseChecks();
    expect(checks.map((c) => c.name).sort()).toEqual(["definer_functions_open_to_browser_roles", "functions_without_search_path", "tables_without_rls"]);
    expect(checks.filter((c) => c.problems > 0)).toEqual([]);
  });

  it("can't be run by a browser role", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.rpc("admin_database_checks");
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
