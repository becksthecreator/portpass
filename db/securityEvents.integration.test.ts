import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { countSecurityEvents, failedSignInsByAddress, listSecurityEvents, pruneSecurityEvents, recordSecurityEvent, rememberAdminDevice } from "./securityEvents";
import { logAudit, listAudit } from "./audit";

// Brief 21, part G: what the alerts count, and the audit log's new column.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const TAG = `sec-${Date.now().toString(36)}`;
const IP = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
const USER = "00000000-0000-4000-8000-00000000c0de";

afterAll(async () => {
  await db.from("security_events").delete().eq("ip", IP);
  await db.from("security_events").delete().eq("detail->>tag", TAG);
  await db.from("admin_devices").delete().eq("user_id", USER);
  await db.from("audit_log").delete().eq("action", `test.${TAG}`);
});

describe("security events", () => {
  it("are counted by kind within a window, and grouped by address", async () => {
    const since = new Date().toISOString();
    await recordSecurityEvent("login_failed", IP);
    await recordSecurityEvent("login_failed", IP);
    await recordSecurityEvent("pin_failed", IP);
    const counts = await countSecurityEvents(["login_failed", "pin_failed", "admin_code_failed"], since);
    expect(counts.login_failed).toBeGreaterThanOrEqual(2);
    expect(counts.pin_failed).toBeGreaterThanOrEqual(1);
    const byAddress = await failedSignInsByAddress(["login_failed", "pin_failed", "admin_code_failed"], since);
    expect(byAddress.find((row) => row.ip === IP)?.count).toBeGreaterThanOrEqual(3);
    const listed = await listSecurityEvents(10);
    expect(listed.some((e) => e.ip === IP)).toBe(true);
  });

  it("keep only an address and a few words, never an email, a PIN or a code", async () => {
    await recordSecurityEvent("cron_unset", null, { path: "/api/cron/daily", tag: TAG });
    const { data } = await db.from("security_events").select("ip,detail").eq("detail->>tag", TAG).single();
    expect(data).toEqual({ ip: null, detail: { path: "/api/cron/daily", tag: TAG } });
  });

  it("prune after 90 days and leave newer rows alone", async () => {
    const old = new Date(Date.now() - 95 * 24 * 3600_000).toISOString();
    await db.from("security_events").insert({ kind: "login_failed", ip: IP, detail: { tag: TAG }, created_at: old });
    await pruneSecurityEvents();
    const { count } = await db.from("security_events").select("id", { count: "exact", head: true }).eq("ip", IP).lt("created_at", new Date(Date.now() - 90 * 24 * 3600_000).toISOString());
    expect(count).toBe(0);
    const { count: kept } = await db.from("security_events").select("id", { count: "exact", head: true }).eq("ip", IP);
    expect(kept).toBeGreaterThanOrEqual(3);
  });

  it("remember an admin device once: new the first time, known after, last seen moving", async () => {
    const first = await rememberAdminDevice(USER, `hash-${TAG}`, "Safari on iPhone", new Date("2026-10-06T10:00:00Z"));
    expect(first).toEqual({ isNew: true });
    const again = await rememberAdminDevice(USER, `hash-${TAG}`, "Safari on iPhone", new Date("2026-10-06T11:00:00Z"));
    expect(again).toEqual({ isNew: false });
    const other = await rememberAdminDevice(USER, `hash-${TAG}-laptop`, "Chrome on Windows");
    expect(other).toEqual({ isNew: true });
    const { data } = await db.from("admin_devices").select("label,first_seen_at,last_seen_at").eq("user_id", USER).eq("device_hash", `hash-${TAG}`).single();
    expect(data!.label).toBe("Safari on iPhone");
    expect(Date.parse(data!.last_seen_at)).toBeGreaterThan(Date.parse(data!.first_seen_at));
  });

  it("cannot be read or written by a browser key", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? "", { auth: { persistSession: false } });
    for (const table of ["security_events", "admin_devices"]) {
      const read = await anon.from(table).select("id").limit(1);
      expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
      const write = await anon.from(table).insert({ kind: "login_failed", user_id: USER, device_hash: "x", label: "x" });
      expect(write.error).not.toBeNull();
    }
  });
});

describe("the audit log's address", () => {
  it("is stored when given, null when written by a job, and read back", async () => {
    await logAudit({ action: `test.${TAG}`, after: { n: 1 }, ip: "198.51.100.7" });
    await logAudit({ action: `test.${TAG}`, after: { n: 2 }, ip: null });
    const rows = await listAudit({ action: `test.${TAG}`, limit: 5 });
    expect(rows.map((r) => r.ip).sort()).toEqual([null, "198.51.100.7"].sort());
    // Outside a request (this test), the address read from the request is null.
    await logAudit({ action: `test.${TAG}`, after: { n: 3 } });
    expect((await listAudit({ action: `test.${TAG}`, limit: 5 })).find((r) => (r.after as { n: number }).n === 3)?.ip).toBeNull();
  });
});
