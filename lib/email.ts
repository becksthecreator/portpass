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
};

// No-ops with a console warning when RESEND_API_KEY isn't set, so local
// dev and preview builds never crash for missing email config. Uses
// Resend's plain HTTP API directly rather than its SDK, since it's a
// single endpoint and this avoids adding a dependency.
export async function sendEmail({ to, subject, html, from: fromOverride }: SendEmailInput): Promise<void> {
  if (to.trim().toLowerCase().endsWith(TEST_EMAIL_DOMAIN)) {
    console.warn(`[email] Refusing to send to reserved test domain: ${to}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = fromOverride ?? process.env.FUTPREP_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(`[email] RESEND_API_KEY or the from address not set — skipping email to ${to}: "${subject}"`);
    return;
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
      console.error(`[email] Resend send failed (${response.status}) for ${to}: ${await response.text().catch(() => "")}`);
    }
  } catch (error) {
    console.error(`[email] Resend send threw for ${to}`, error);
  }
}

function emailShell(title: string, bodyHtml: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#171717">
    <h1 style="font-size:22px;margin:0 0 16px">${title}</h1>
    ${bodyHtml}
    <p style="color:#647069;font-size:12px;margin-top:32px">Futprep Athletics · Sent via PortPass</p>
  </div>`;
}

export function portpassFrom(): string | undefined {
  return process.env.PORTPASS_FROM_EMAIL ?? process.env.FUTPREP_FROM_EMAIL;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function portpassEmailShell(title: string, bodyHtml: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#14303d">
    <p style="font-size:12px;font-weight:800;letter-spacing:3px;margin:0 0 18px;color:#e8794a">PORTPASS</p>
    <h1 style="font-size:22px;margin:0 0 16px">${title}</h1>
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
}) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#647069;vertical-align:top">${label}</td><td style="padding:6px 0;text-align:right">${value}</td></tr>`;
  const waLink = `https://wa.me/${input.whatsappE164.replace(/\D/g, "")}`;
  const source = [input.utmSource, input.utmMedium, input.utmCampaign].filter(Boolean).map((v) => escapeHtml(v as string)).join(" / ");
  await sendEmail({
    to: PORTPASS_SUPPORT_EMAIL,
    from: portpassFrom(),
    subject: `New listing request — ${input.organizationName}`,
    html: portpassEmailShell("New listing request", `
      <p><strong>${escapeHtml(input.organizationName)}</strong> wants to be listed on PortPass.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${row("Contact", escapeHtml(input.contactPerson))}
        ${row("Section", escapeHtml(input.section))}
        ${row("WhatsApp", `<a href="${waLink}" style="color:#B9532A">${escapeHtml(input.whatsappE164)}</a>`)}
        ${input.instagramHandle ? row("Instagram", `<a href="https://instagram.com/${encodeURIComponent(input.instagramHandle)}" style="color:#B9532A">@${escapeHtml(input.instagramHandle)}</a>`) : ""}
        ${input.note ? row("Note", escapeHtml(input.note)) : ""}
        ${source ? row("Source", source) : ""}
        ${row("Reference", `#${input.id}`)}
      </table>
      <p><a href="https://portpassbahamas.com/admin" style="color:#B9532A">Open the approvals queue →</a></p>
    `),
  });
}

// Someone swapping a business's bank details is the fraud to design out,
// so every change tells every owner, whoever made it.
export async function sendBankDetailsChangedEmail(input: { to: string[]; businessName: string; changedBy: string; settingsUrl: string }) {
  for (const to of input.to) {
    await sendEmail({
      to,
      from: portpassFrom(),
      subject: `Your payment details were changed — ${input.businessName}`,
      html: portpassEmailShell("Your payment details were changed", `
        <p>The bank-transfer details customers see for <strong>${escapeHtml(input.businessName)}</strong> were just changed by <strong>${escapeHtml(input.changedBy)}</strong>.</p>
        <p>If that was you or your team, nothing to do. If it wasn't, change them back now and reply to this email so we can help.</p>
        <p><a href="${input.settingsUrl}" style="color:#B9532A">Review payment details →</a></p>
      `),
    });
  }
}

export async function sendBusinessSubmittedEmail(input: { to: string[]; businessName: string; section: string | null; submittedBy: string; previewUrl: string }) {
  for (const to of input.to) {
    await sendEmail({
      to,
      from: portpassFrom(),
      subject: `Review request — ${input.businessName}`,
      html: portpassEmailShell("A business is ready for review", `
        <p><strong>${escapeHtml(input.businessName)}</strong>${input.section ? ` (${escapeHtml(input.section)})` : ""} was submitted by ${escapeHtml(input.submittedBy)}.</p>
        <p><a href="${input.previewUrl}" style="color:#B9532A">Preview the page →</a> &nbsp; <a href="https://portpassbahamas.com/admin" style="color:#B9532A">Open the approvals queue →</a></p>
        <p>The owner has been told to expect a reply within 2 business days.</p>
      `),
    });
  }
}

export async function sendFutprepRegistrationReceivedEmail(input: {
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
    subject: `Futprep registration received — ${input.childName}`,
    html: emailShell("Registration received", `
      <p>Hi ${input.parentName},</p>
      <p>Futprep has received the registration for <strong>${input.childName}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#647069">Class</td><td style="padding:6px 0;text-align:right">${input.programName}</td></tr>
        <tr><td style="padding:6px 0;color:#647069">Time</td><td style="padding:6px 0;text-align:right">${input.day} · ${input.time}–${input.endTime}</td></tr>
        <tr><td style="padding:6px 0;color:#647069">Location</td><td style="padding:6px 0;text-align:right">${input.location}</td></tr>
        <tr><td style="padding:6px 0;color:#647069">Amount due</td><td style="padding:6px 0;text-align:right">${money}</td></tr>
      </table>
      <p>Registration code: <strong>${input.referenceCode}</strong> — use this as your payment reference.</p>
      <p><a href="${input.statusUrl}" style="color:#f0245c">Check your registration status →</a></p>
    `),
  });
}

export async function sendFutprepPaymentRecordedEmail(input: {
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
    subject: `Payment recorded — ${input.childName}`,
    html: emailShell("Payment recorded", `
      <p>Hi ${input.parentName},</p>
      <p>Futprep recorded a payment of <strong>${money(input.amountRecordedCents)}</strong> for <strong>${input.childName}</strong>.</p>
      <p>${input.balanceCents > 0 ? `Remaining balance: <strong>${money(input.balanceCents)}</strong>.` : "This registration is now fully paid."}</p>
      <p><a href="${input.statusUrl}" style="color:#f0245c">Check your registration status →</a></p>
    `),
  });
}

export async function sendFutprepRegistrationConfirmedEmail(input: {
  parentEmail: string;
  parentName: string;
  childName: string;
  programName: string;
  statusUrl: string;
}) {
  await sendEmail({
    to: input.parentEmail,
    subject: `Registration confirmed — ${input.childName}`,
    html: emailShell("Registration confirmed", `
      <p>Hi ${input.parentName},</p>
      <p>Futprep has confirmed <strong>${input.childName}</strong>'s spot in <strong>${input.programName}</strong>. See you on the field!</p>
      <p><a href="${input.statusUrl}" style="color:#f0245c">View registration details →</a></p>
    `),
  });
}
