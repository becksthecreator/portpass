import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupState, deploymentInfo, systemSwitches } from "./adminHealth";
import { deliveryFromEvent, verifyResendSignature } from "./resendWebhook";

// A made-up secret in the service's format ("whsec_" + base64). Not a real key.
const SECRET = `whsec_${Buffer.from("test-signing-secret-not-real").toString("base64")}`;
const NOW = Date.parse("2026-10-02T12:00:00Z");
const TIMESTAMP = String(NOW / 1000);
const BODY = JSON.stringify({ type: "email.bounced", data: { email_id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" } });

function sign(body: string, id = "msg_test1", timestamp = TIMESTAMP, secret = SECRET): string {
  const key = Buffer.from(secret.slice(6), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

describe("the email service's webhook signature", () => {
  it("accepts a call signed with the shared secret", () => {
    expect(verifyResendSignature({ secret: SECRET, id: "msg_test1", timestamp: TIMESTAMP, signature: sign(BODY), body: BODY, now: NOW })).toBe(true);
  });

  it("accepts any one of several signatures, so the secret can be changed without a gap", () => {
    expect(verifyResendSignature({ secret: SECRET, id: "msg_test1", timestamp: TIMESTAMP, signature: `v1,AAAA ${sign(BODY)} v2,ignored`, body: BODY, now: NOW })).toBe(true);
  });

  it("refuses a changed body, another id, another secret, or no signature at all", () => {
    const signature = sign(BODY);
    expect(verifyResendSignature({ secret: SECRET, id: "msg_test1", timestamp: TIMESTAMP, signature, body: BODY.replace("bounced", "delivered"), now: NOW })).toBe(false);
    expect(verifyResendSignature({ secret: SECRET, id: "msg_other", timestamp: TIMESTAMP, signature, body: BODY, now: NOW })).toBe(false);
    expect(verifyResendSignature({ secret: `whsec_${Buffer.from("another-secret").toString("base64")}`, id: "msg_test1", timestamp: TIMESTAMP, signature, body: BODY, now: NOW })).toBe(false);
    expect(verifyResendSignature({ secret: SECRET, id: "msg_test1", timestamp: TIMESTAMP, signature: null, body: BODY, now: NOW })).toBe(false);
    expect(verifyResendSignature({ secret: undefined, id: "msg_test1", timestamp: TIMESTAMP, signature, body: BODY, now: NOW })).toBe(false);
    expect(verifyResendSignature({ secret: "whsec_", id: "msg_test1", timestamp: TIMESTAMP, signature, body: BODY, now: NOW })).toBe(false);
  });

  it("refuses a call more than five minutes old, or dated in the future", () => {
    const old = String(NOW / 1000 - 6 * 60);
    expect(verifyResendSignature({ secret: SECRET, id: "msg_test1", timestamp: old, signature: sign(BODY, "msg_test1", old), body: BODY, now: NOW })).toBe(false);
    const ahead = String(NOW / 1000 + 6 * 60);
    expect(verifyResendSignature({ secret: SECRET, id: "msg_test1", timestamp: ahead, signature: sign(BODY, "msg_test1", ahead), body: BODY, now: NOW })).toBe(false);
    expect(verifyResendSignature({ secret: SECRET, id: "msg_test1", timestamp: "yesterday", signature: sign(BODY), body: BODY, now: NOW })).toBe(false);
  });
});

describe("what a webhook event means for the Messages log", () => {
  const id = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";

  it("reads delivered, bounced and marked-as-spam", () => {
    expect(deliveryFromEvent({ type: "email.delivered", data: { email_id: id } })).toEqual({ providerId: id, status: "delivered", detail: null });
    expect(deliveryFromEvent({ type: "email.bounced", data: { email_id: id, bounce: { type: "Permanent", subType: "Suppressed" } } })).toEqual({ providerId: id, status: "bounced", detail: "Bounced: Permanent, Suppressed." });
    expect(deliveryFromEvent({ type: "email.complained", data: { email_id: id } })).toMatchObject({ status: "complained" });
    expect(deliveryFromEvent({ type: "email.failed", data: { email_id: id, failed: { reason: "TEST free text that must not be kept" } } })).toEqual({ providerId: id, status: "failed", detail: "The email service could not send it." });
  });

  it("keeps only the service's short labels, never free text from the message", () => {
    const event = { type: "email.bounced", data: { email_id: id, bounce: { type: "Permanent", subType: "550 5.1.1 <parent@example.com> no such user" } } };
    expect(deliveryFromEvent(event)?.detail).toBe("Bounced: Permanent.");
  });

  it("ignores everything else", () => {
    expect(deliveryFromEvent({ type: "email.opened", data: { email_id: id } })).toBeNull();
    expect(deliveryFromEvent({ type: "email.bounced", data: {} })).toBeNull();
    expect(deliveryFromEvent({ type: "email.bounced", data: { email_id: "x'; drop table" } })).toBeNull();
    expect(deliveryFromEvent(null)).toBeNull();
    expect(deliveryFromEvent("email.bounced")).toBeNull();
  });
});

describe("health, from what this copy of the site knows", () => {
  it("names the running version by its short commit", () => {
    expect(deploymentInfo({ VERCEL_GIT_COMMIT_SHA: "90a9f34d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f", VERCEL_ENV: "production" })).toEqual({ commit: "90a9f34", environment: "production" });
    expect(deploymentInfo({})).toEqual({ commit: null, environment: null });
    expect(deploymentInfo({ VERCEL_GIT_COMMIT_SHA: "not a commit" }).commit).toBeNull();
  });

  it("calls a backup late after a day and a half, and says when it failed or never ran", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(backupState({ at: "2026-10-02T07:10:00Z", ok: true }, now)).toEqual({ state: "ok", at: "2026-10-02T07:10:00Z" });
    expect(backupState({ at: "2026-09-30T07:10:00Z", ok: true }, now).state).toBe("late");
    expect(backupState({ at: "2026-10-02T07:10:00Z", ok: false }, now).state).toBe("failed");
    expect(backupState(null, now)).toEqual({ state: "never", at: null });
    expect(backupState(undefined, now).state).toBe("unknown");
    expect(backupState({ at: "not a date", ok: true }, now).state).toBe("unknown");
  });

  it("says what is switched on by the names of its settings, never their values", () => {
    const env = { RESEND_API_KEY: "value-one-not-real", PORTPASS_FROM_EMAIL: "PortPass <hello@example.test>", CRON_SECRET: "  ", ANTHROPIC_API_KEY: "value-two-not-real" };
    const switches = systemSwitches(env);
    const state = (label: string) => switches.find((s) => s.label === label)?.on;
    expect(state("Sending email from PortPass")).toBe(true);
    // Parents' emails use Futprep's own sender, which is not set here.
    expect(state("Sending email to Futprep parents")).toBe(false);
    expect(systemSwitches({ WEDDING_DESK_NOTIFY_EMAIL: "desk@example.test" }).find((s) => s.label === "Wedding enquiry notices")?.on).toBe(false);
    // Blank is not set.
    expect(state("Scheduled jobs")).toBe(false);
    expect(state("Leads: AI summary and first message")).toBe(true);
    expect(state("Leads: Instagram lookup")).toBe(false);
    const shown = JSON.stringify(switches);
    for (const value of Object.values(env)) if (value.trim()) expect(shown).not.toContain(value);
    expect(shown).toContain("RESEND_WEBHOOK_SECRET");
  });
});

// Every email that asks for it writes one line to the Messages log: who,
// which kind, what happened, and the email service's id. Never the text.
// Quiet: the email module warns when it skips or fails, by design.
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

const logged = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/db/growth", () => ({
  logMessage: vi.fn(async (row: Record<string, unknown>) => {
    logged.rows.push(row);
  }),
}));

describe("the Messages log line an email writes", () => {
  beforeEach(() => {
    logged.rows = [];
    process.env.RESEND_API_KEY = "test-key-not-real";
    process.env.FUTPREP_FROM_EMAIL = "Futprep <hello@example.test>";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.FUTPREP_FROM_EMAIL;
  });

  const send = async (to: string) => {
    const { sendEmail } = await import("./email");
    return sendEmail({ to, subject: "TEST subject with a child's name", html: "<p>TEST body</p>", log: { template: "test_template", organizationId: 7 } });
  };

  it("records sent, with the service's id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }), { status: 200 })));
    expect(await send("parent@family.test")).toBe("sent");
    expect(logged.rows).toEqual([{ organizationId: 7, template: "test_template", recipient: "parent@family.test", status: "sent", detail: null, providerId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }]);
  });

  it("records a refusal, an unreachable service and email not being set up", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    expect(await send("parent@family.test")).toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await send("parent@family.test")).toBe("failed");
    delete process.env.RESEND_API_KEY;
    expect(await send("parent@family.test")).toBe("skipped");
    expect(logged.rows.map((row) => [row.status, row.detail])).toEqual([["failed", "The email service refused it (422)."], ["failed", "The email service could not be reached."], ["skipped", "Email is not set up yet."]]);
  });

  it("never emails a test address, and says so", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await send("test-delete-someone@test.portpass.local")).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
    expect(logged.rows[0]).toMatchObject({ status: "skipped", detail: "A test address: never emailed." });
  });

  // The demo business's invented people are all at example.com.
  it("never emails an example address, whatever asked for it", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const address of ["renee.brightwater@example.com", "Someone@EXAMPLE.org", "x@example.net"]) expect(await send(address)).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
    expect(logged.rows).toEqual([]);
  });

  it("keeps the subject and the text out of the log", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await send("parent@family.test");
    expect(JSON.stringify(logged.rows)).not.toMatch(/TEST subject|TEST body/);
  });

  it("writes nothing when an email doesn't ask for a line", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "parent@family.test", subject: "TEST", html: "<p>TEST</p>" });
    expect(logged.rows).toEqual([]);
  });
});
