import { PORTPASS_SUPPORT_EMAIL } from "./contact";

const RESEND_API_URL = "https://api.resend.com/emails";

// Reserved for test/seed data (registrations created by integration tests
// or scripts/seed-test-data.ts) so it can be bulk-purged and never
// accidentally emailed - a real address that happens to end in this domain
// isn't a thing, so refusing it outright has no legitimate downside.
const TEST_EMAIL_DOMAIN = "@test.portpass.local";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  // Defaults to the Futprep sender; PortPass's own emails pass
  // portpassFrom() so the two senders can differ once both are configured.
  from?: string;
  // Writes the outcome to the Messages log (Admin -> Messages): who it
  // was for, which kind of email, and whether it went. Never the text or
  // the subject, which can carry a child's name.
  log?: { template: string; organizationId?: number | null };
};

// The log is loaded only when an email asks for it, and a failed log line
// never fails the email.
async function record(input: SendEmailInput, status: EmailOutcome, detail: string | null, providerId: string | null = null): Promise<void> {
  if (!input.log) return;
  try {
    const { logMessage } = await import("@/db/growth");
    await logMessage({ organizationId: input.log.organizationId ?? null, template: input.log.template, recipient: input.to, status, detail, providerId });
  } catch (error) {
    console.error("[email] The Messages log could not be written.", error instanceof Error ? error.message : "");
  }
}

// What became of an email: the Messages log records it (never the text).
export type EmailOutcome = "sent" | "failed" | "skipped";

// No-ops with a console warning when RESEND_API_KEY isn't set, so local
// dev and preview builds never crash for missing email config. Uses
// Resend's plain HTTP API directly rather than its SDK, since it's a
// single endpoint and this avoids adding a dependency.
export async function sendEmail(input: SendEmailInput): Promise<EmailOutcome> {
  const { to, subject, html, from: fromOverride } = input;
  if (to.trim().toLowerCase().endsWith(TEST_EMAIL_DOMAIN)) {
    console.warn("[email] Refusing to send to the reserved test domain.");
    await record(input, "skipped", "A test address: never emailed.");
    return "skipped";
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = fromOverride ?? process.env.FUTPREP_FROM_EMAIL;

  if (!apiKey || !from) {
    // Never the address or the subject: a subject can carry a child's name,
    // and these lines are kept in the host's logs.
    console.warn("[email] RESEND_API_KEY or the from address is not set: an email was skipped.");
    await record(input, "skipped", "Email is not set up yet.");
    return "skipped";
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      console.error(`[email] Resend send failed (${response.status}).`);
      await record(input, "failed", `The email service refused it (${response.status}).`);
      return "failed";
    }
    // The service's id for this email: its webhook reports delivery and
    // bounces against it.
    const accepted = (await response.json().catch(() => null)) as { id?: unknown } | null;
    await record(input, "sent", null, typeof accepted?.id === "string" ? accepted.id : null);
    return "sent";
  } catch (error) {
    console.error("[email] Resend send threw.", error instanceof Error ? error.message : "");
    await record(input, "failed", "The email service could not be reached.");
    return "failed";
  }
}

function emailShell(title: string, bodyHtml: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#171717">
    <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="color:#647069;font-size:12px;margin-top:32px">Futprep Athletics · Sent via PortPass</p>
  </div>`;
}

export function portpassFrom(): string | undefined {
  return process.env.PORTPASS_FROM_EMAIL ?? process.env.FUTPREP_FROM_EMAIL;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function portpassEmailShell(title: string, bodyHtml: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0D1B3D">
    <p style="font-size:12px;font-weight:800;letter-spacing:3px;margin:0 0 18px;color:#0D1B3D">PORTPASS</p>
    <h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="color:#647069;font-size:12px;margin-top:32px">PortPass Bahamas Technologies · portpassbahamas.com</p>
  </div>`;
}

// Internal notification for a new listing request from /apply. Everything
// in it is typed by a stranger on the internet, so it's escaped -- it lands
// in a staff inbox as HTML.
export async function sendApplicationReceivedEmail(input: {
  id: number;
  organizationName: string;
  contactPerson: string;
  section: string;
  whatsappE164: string;
  instagramHandle: string | null;
  note: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  planName?: string | null;
}) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#647069;vertical-align:top">${label}</td><td style="padding:6px 0;text-align:right">${value}</td></tr>`;
  const waLink = `https://wa.me/${input.whatsappE164.replace(/\D/g, "")}`;
  const source = [input.utmSource, input.utmMedium, input.utmCampaign].filter(Boolean).map((v) => escapeHtml(v as string)).join(" / ");
  await sendEmail({
    to: PORTPASS_SUPPORT_EMAIL,
    from: portpassFrom(),
    log: { template: "listing_request_received" },
    subject: `New listing request — ${input.organizationName}`,
    html: portpassEmailShell("New listing request", `
      <p><strong>${escapeHtml(input.organizationName)}</strong> wants to be listed on PortPass.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row("Contact", escapeHtml(input.contactPerson))}
        ${row("Section", escapeHtml(input.section))}
        ${input.planName ? row("Plan picked", escapeHtml(input.planName)) : ""}
        ${row("WhatsApp", `<a href="${waLink}" style="color:#2463AE">${escapeHtml(input.whatsappE164)}</a>`)}
        ${input.instagramHandle ? row("Instagram", `<a href="https://instagram.com/${encodeURIComponent(input.instagramHandle)}" style="color:#2463AE">@${escapeHtml(input.instagramHandle)}</a>`) : ""}
        ${input.note ? row("Note", escapeHtml(input.note)) : ""}
        ${source ? row("Source", source) : ""}
        ${row("Reference", `#${input.id}`)}
      </table>
      <p><a href="https://portpassbahamas.com/admin" style="color:#2463AE">Open the approvals queue →</a></p>
    `),
  });
}

// Someone swapping a business's bank details is the fraud to design out,
// so every change tells every owner, whoever made it.
export async function sendBankDetailsChangedEmail(input: { to: string[]; businessName: string; changedBy: string; settingsUrl: string; organizationId?: number }) {
  for (const to of input.to) {
    await sendEmail({
      to,
      from: portpassFrom(),
      log: { template: "bank_details_changed", organizationId: input.organizationId ?? null },
      subject: `Your payment details were changed — ${input.businessName}`,
      html: portpassEmailShell("Your payment details were changed", `
        <p>The bank-transfer details customers see for <strong>${escapeHtml(input.businessName)}</strong> were just changed by <strong>${escapeHtml(input.changedBy)}</strong>.</p>
        <p>If that was you or your team, nothing to do. If it wasn't, change them back now and reply to this email so we can help.</p>
        <p><a href="${input.settingsUrl}" style="color:#2463AE">Review payment details →</a></p>
      `),
    });
  }
}

export async function sendBusinessSubmittedEmail(input: { organizationId?: number | null; to: string[]; businessName: string; section: string | null; submittedBy: string; previewUrl: string }) {
  for (const to of input.to) {
    await sendEmail({
      to,
      from: portpassFrom(),
      log: { template: "business_submitted_for_review", organizationId: input.organizationId ?? null },
      subject: `Review request — ${input.businessName}`,
      html: portpassEmailShell("A business is ready for review", `
        <p><strong>${escapeHtml(input.businessName)}</strong>${input.section ? ` (${escapeHtml(input.section)})` : ""} was submitted by ${escapeHtml(input.submittedBy)}.</p>
        <p><a href="${input.previewUrl}" style="color:#2463AE">Preview the page →</a> &nbsp; <a href="https://portpassbahamas.com/admin" style="color:#2463AE">Open the approvals queue →</a></p>
        <p>The owner has been told to expect a reply within 2 business days.</p>
      `),
    });
  }
}

export async function sendFutprepRegistrationReceivedEmail(input: {
  organizationId?: number | null;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  day: string;
  time: string;
  endTime: string;
  location: string;
  amountDueCents: number;
  referenceCode: string;
  statusUrl: string;
}) {
  const money = new Intl.NumberFormat("en-BS", { style: "currency", currency: "BSD", minimumFractionDigits: 0 }).format(input.amountDueCents / 100);
  await sendEmail({
    to: input.parentEmail,
    log: { template: "futprep_registration_received", organizationId: input.organizationId ?? null },
    subject: `Futprep registration received — ${input.childName}`,
    html: emailShell("Registration received", `
      <p>Hi ${escapeHtml(input.parentName)},</p>
      <p>Futprep has received the registration for <strong>${escapeHtml(input.childName)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#647069">Class</td><td style="padding:6px 0;text-align:right">${escapeHtml(input.programName)}</td></tr>
        <tr><td style="padding:6px 0;color:#647069">Time</td><td style="padding:6px 0;text-align:right">${escapeHtml(input.day)} · ${escapeHtml(input.time)}–${escapeHtml(input.endTime)}</td></tr>
        <tr><td style="padding:6px 0;color:#647069">Location</td><td style="padding:6px 0;text-align:right">${escapeHtml(input.location)}</td></tr>
        <tr><td style="padding:6px 0;color:#647069">Amount due</td><td style="padding:6px 0;text-align:right">${money}</td></tr>
      </table>
      <p>Registration code: <strong>${escapeHtml(input.referenceCode)}</strong> — use this as your payment reference.</p>
      <p><a href="${input.statusUrl}" style="color:#f0245c">Check your registration status →</a></p>
    `),
  });
}

export async function sendFutprepPaymentRecordedEmail(input: {
  organizationId?: number | null;
  parentEmail: string;
  parentName: string;
  childName: string;
  amountRecordedCents: number;
  balanceCents: number;
  paymentStatus: string;
  statusUrl: string;
}) {
  const money = (cents: number) => new Intl.NumberFormat("en-BS", { style: "currency", currency: "BSD", minimumFractionDigits: 0 }).format(cents / 100);
  await sendEmail({
    to: input.parentEmail,
    log: { template: "futprep_payment_recorded", organizationId: input.organizationId ?? null },
    subject: `Payment recorded — ${input.childName}`,
    html: emailShell("Payment recorded", `
      <p>Hi ${escapeHtml(input.parentName)},</p>
      <p>Futprep recorded a payment of <strong>${money(input.amountRecordedCents)}</strong> for <strong>${escapeHtml(input.childName)}</strong>.</p>
      <p>${input.balanceCents > 0 ? `Remaining balance: <strong>${money(input.balanceCents)}</strong>.` : "This registration is now fully paid."}</p>
      <p><a href="${input.statusUrl}" style="color:#f0245c">Check your registration status →</a></p>
    `),
  });
}

export async function sendFutprepRegistrationConfirmedEmail(input: {
  organizationId?: number | null;
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  statusUrl: string;
}) {
  await sendEmail({
    to: input.parentEmail,
    log: { template: "futprep_registration_confirmed", organizationId: input.organizationId ?? null },
    subject: `Registration confirmed — ${input.childName}`,
    html: emailShell("Registration confirmed", `
      <p>Hi ${escapeHtml(input.parentName)},</p>
      <p>Futprep has confirmed <strong>${escapeHtml(input.childName)}</strong>'s spot in <strong>${escapeHtml(input.programName)}</strong>. See you on the field!</p>
      <p><a href="${input.statusUrl}" style="color:#f0245c">View registration details →</a></p>
    `),
  });
}

// A private session or party a coach has accepted (brief 06 v2, Part B):
// when, where, how much, and how to pay with the PS- code as the transfer
// reference. Nothing about the child beyond their first name.
export type PrivateSessionAcceptedInput = {
  organizationId?: number | null;
  parentName: string;
  childName: string;
  serviceName: string;
  coachName: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  location: string;
  priceCents: number | null;
  referenceCode: string;
  bank: { bankName: string; accountName: string; accountNumber: string; swiftCode: string };
};

const SESSION_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function privateSessionAcceptedEmail(input: PrivateSessionAcceptedInput): { subject: string; html: string } {
  const day = SESSION_DAY.format(new Date(`${input.date}T12:00:00Z`)).replace(",", "");
  const price = input.priceCents === null ? "Your coach will confirm the price" : `$${(input.priceCents / 100).toFixed(input.priceCents % 100 === 0 ? 0 : 2)}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#647069">${label}</td><td style="padding:6px 0;text-align:right">${value}</td></tr>`;
  const subject = `Confirmed: ${input.serviceName} with ${input.coachName}, ${day}`;
  const html = emailShell("Session confirmed", `
      <p>Hi ${escapeHtml(input.parentName)},</p>
      <p>${escapeHtml(input.coachName)} has accepted the ${escapeHtml(input.serviceName)} for <strong>${escapeHtml(input.childName)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row("When", `${escapeHtml(day)} · ${escapeHtml(input.startTime)} · ${input.durationMinutes} minutes`)}
        ${row("Where", escapeHtml(input.location || "Your coach will confirm the place"))}
        ${row("Price", escapeHtml(price))}
        ${row("Reference", `<strong>${escapeHtml(input.referenceCode)}</strong>`)}
      </table>
      <p><strong>How to pay:</strong> cash to your coach at the session, or a bank transfer before it. For a transfer, use <strong>${escapeHtml(input.referenceCode)}</strong> as the reference so Futprep can match it.</p>
      <p style="font-size:13px;color:#647069">${escapeHtml(input.bank.bankName)} · ${escapeHtml(input.bank.accountName)} · Account ${escapeHtml(input.bank.accountNumber)} · SWIFT ${escapeHtml(input.bank.swiftCode)}</p>
      <p>Need to change the time? Reply to this email or message Futprep on WhatsApp.</p>
    `);
  return { subject, html };
}

export async function sendPrivateSessionAcceptedEmail(input: PrivateSessionAcceptedInput & { parentEmail: string }) {
  const { subject, html } = privateSessionAcceptedEmail(input);
  await sendEmail({ to: input.parentEmail, subject, html, log: { template: "futprep_private_session_accepted", organizationId: input.organizationId ?? null } });
}
