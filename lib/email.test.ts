import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, sendFutprepPaymentRecordedEmail, sendFutprepRegistrationConfirmedEmail, sendFutprepRegistrationReceivedEmail } from "./email";

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

describe("Futprep registration emails", () => {
  it("never let a typed name become markup", async () => {
    await sendFutprepRegistrationReceivedEmail({
      parentEmail: "parent@example.com", parentName: HOSTILE, childName: HOSTILE, programName: HOSTILE,
      day: "Saturday", time: "9:00 AM", endTime: "9:45 AM", location: HOSTILE, amountDueCents: 30000,
      referenceCode: "FP-2026-AB12CD34", statusUrl: "https://portpassbahamas.com/futprep/my/FP-2026-AB12CD34",
    });
    await sendFutprepPaymentRecordedEmail({ parentEmail: "parent@example.com", parentName: HOSTILE, childName: HOSTILE, amountRecordedCents: 3500, balanceCents: 0, paymentStatus: "paid", statusUrl: "https://portpassbahamas.com/futprep/my" });
    await sendFutprepRegistrationConfirmedEmail({ parentEmail: "parent@example.com", parentName: HOSTILE, childName: HOSTILE, programName: HOSTILE, statusUrl: "https://portpassbahamas.com/futprep/my" });

    expect(sent).toHaveLength(3);
    for (const email of sent) {
      expect(email.html).not.toContain("<img");
      expect(email.html).not.toContain("onerror=\"");
      expect(email.html).not.toContain("https://evil.example\"");
      expect(email.html).toContain("&lt;img src=x");
    }
  });

  it("says nothing about the recipient in the logs when email isn't configured", async () => {
    delete process.env.RESEND_API_KEY;
    await sendFutprepRegistrationConfirmedEmail({ parentEmail: "parent@example.com", parentName: "Jane Parent", childName: "Ava Child", programName: "Kickers", statusUrl: "https://portpassbahamas.com/futprep/my" });
    expect(sent).toHaveLength(0);
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
    expect(logged).not.toContain("parent@example.com");
    expect(logged).not.toContain("Ava Child");
  });
});
