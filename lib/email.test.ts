import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanEnvValue, escapeHtml, sendEmail, sendFutprepPaymentRecordedEmail, sendFutprepRegistrationConfirmedEmail, sendFutprepRegistrationReceivedEmail } from "./email";

// The registration emails go to whatever address was typed on a public
// form, with the names that were typed. Those names must arrive as text,
// never as markup, and nothing about the recipient may be written to logs.
const HOSTILE = `<img src=x onerror="alert(1)"><a href="https://evil.example">click</a>`;

let sent: Array<{ to: string; subject: string; html: string }> = [];
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
const error = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  sent = [];
  warn.mockClear();
  error.mockClear();
  process.env.RESEND_API_KEY = "test-key-not-real";
  process.env.FUTPREP_FROM_EMAIL = "Futprep <hello@example.test>";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.FUTPREP_FROM_EMAIL;
});

describe("escapeHtml", () => {
  it("makes markup characters literal", () => {
    expect(escapeHtml(`a<b>&"c"`)).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });
});

describe("cleanEnvValue", () => {
  it("trims and unwraps a quoted paste, but leaves a quoted display name alone", () => {
    expect(cleanEnvValue("  re_abc \n")).toBe("re_abc");
    expect(cleanEnvValue("\"re_abc\"")).toBe("re_abc");
    expect(cleanEnvValue("'re_abc'")).toBe("re_abc");
    expect(cleanEnvValue("\"Futprep via PortPass\" <a@b.test>")).toBe("\"Futprep via PortPass\" <a@b.test>");
    expect(cleanEnvValue("   ")).toBeUndefined();
    expect(cleanEnvValue(undefined)).toBeUndefined();
  });
});

describe("Futprep registration emails", () => {
  it("never let a typed name become markup", async () => {
    await sendFutprepRegistrationReceivedEmail({
      parentEmail: "parent@family.test", parentName: HOSTILE, childName: HOSTILE, programName: HOSTILE,
      day: "Saturday", time: "9:00 AM", endTime: "9:45 AM", location: HOSTILE, amountDueCents: 30000,
      referenceCode: "FP-2026-AB12CD34", statusUrl: "https://portpassbahamas.com/futprep/my/FP-2026-AB12CD34",
    });
    await sendFutprepPaymentRecordedEmail({ parentEmail: "parent@family.test", parentName: HOSTILE, childName: HOSTILE, amountRecordedCents: 3500, balanceCents: 0, paymentStatus: "paid", statusUrl: "https://portpassbahamas.com/futprep/my" });
    await sendFutprepRegistrationConfirmedEmail({ parentEmail: "parent@family.test", parentName: HOSTILE, childName: HOSTILE, programName: HOSTILE, statusUrl: "https://portpassbahamas.com/futprep/my" });

    expect(sent).toHaveLength(3);
    for (const email of sent) {
      expect(email.html).not.toContain("<img");
      expect(email.html).not.toContain("onerror=\"");
      expect(email.html).not.toContain("https://evil.example\"");
      expect(email.html).toContain("&lt;img src=x");
    }
  });

  it("sends a key and sender pasted with quotes or a trailing newline", async () => {
    let auth = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      auth = init.headers.Authorization;
      sent.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }));
    process.env.RESEND_API_KEY = "\"re_test_not_real\"\n";
    process.env.FUTPREP_FROM_EMAIL = " 'Futprep <hello@example.test>' ";
    const outcome = await sendEmail({ to: "parent@family.test", subject: "s", html: "<p>h</p>" });
    expect(outcome).toBe("sent");
    expect(auth).toBe("Bearer re_test_not_real");
    expect(sent[0]).toMatchObject({ from: "Futprep <hello@example.test>" });
  });

  it("logs Resend's reason for a refusal, without any address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ name: "validation_error", message: "Invalid `to` field: parent@family.test" }), { status: 400 }),
    ));
    const outcome = await sendEmail({ to: "parent@family.test", subject: "s", html: "<p>h</p>" });
    expect(outcome).toBe("failed");
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("Resend send failed (400): validation_error - Invalid `to` field: [address]");
    expect(logged).not.toContain("parent@family.test");
  });

  it("says nothing about the recipient in the logs when email isn't configured", async () => {
    delete process.env.RESEND_API_KEY;
    await sendFutprepRegistrationConfirmedEmail({ parentEmail: "parent@family.test", parentName: "Jane Parent", childName: "Ava Child", programName: "Kickers", statusUrl: "https://portpassbahamas.com/futprep/my" });
    expect(sent).toHaveLength(0);
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain("parent@family.test");
    expect(logged).not.toContain("Ava Child");
  });
});

describe("portpassSender (23 Nov 2026)", () => {
  it("PortPass's own emails reply to the company address, on its own domain", async () => {
    const { portpassSender } = await import("./email");
    const { PORTPASS_SUPPORT_EMAIL } = await import("./contact");
    expect(PORTPASS_SUPPORT_EMAIL).toBe("info@portpassbahamas.com");
    expect(portpassSender().replyTo).toBe("info@portpassbahamas.com");
  });
});
