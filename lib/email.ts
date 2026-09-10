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
};

// No-ops with a console warning when RESEND_API_KEY isn't set, so local
// dev and preview builds never crash for missing email config. Uses
// Resend's plain HTTP API directly rather than its SDK, since it's a
// single endpoint and this avoids adding a dependency.
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (to.trim().toLowerCase().endsWith(TEST_EMAIL_DOMAIN)) {
    console.warn(`[email] Refusing to send to reserved test domain: ${to}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FUTPREP_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn(`[email] RESEND_API_KEY or FUTPREP_FROM_EMAIL not set — skipping email to ${to}: "${subject}"`);
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
