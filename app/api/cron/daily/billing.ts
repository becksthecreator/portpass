import { claimReminder, getBankDetails, releaseReminder, runDailyBilling } from "@/db/billing";
import { logMessage } from "@/db/growth";
import { addDays, annualPriceCents, owedCents } from "@/lib/billing";
import { invoiceReminderEmail, trialEndingEmail } from "@/lib/billingEmail";
import { portpassFrom, sendEmail } from "@/lib/email";

// The billing part of the daily job (brief 09, 2.3):
//   1. drafts the invoices that are due (never sends one: a founder does);
//   2. marks sent invoices past their due date as overdue;
//   3. rewrites each account's next invoice date and status;
//   4. emails the reminders owed today: 7 days and 1 day before a free
//      period ends, 3 days before an invoice is due, 1 day and 7 days
//      after. From 14 days overdue nothing more is sent: the Overview says
//      a founder should call.
// Safe to run twice: an invoice exists once for a period, and a reminder
// is claimed by its key before it is sent. Each email goes to the
// account's billing email only, and is written to the Messages log.
export async function runBillingStep(today: string): Promise<void> {
  const billing = await runDailyBilling(today);
  if (!billing.reminders.length) return;
  const bank = await getBankDetails();
  for (const { reminder, account, planName, invoice } of billing.reminders) {
    try {
      const template = `billing_${reminder.kind}`;
      if (!account.billingEmail) {
        if (await claimReminder(reminder, account.organizationId)) await logMessage({ organizationId: account.organizationId, template, recipient: "(no billing email)", status: "skipped", detail: "The account has no billing email." });
        continue;
      }
      const dashboardUrl = account.organizationSlug ? `https://portpassbahamas.com/business/${encodeURIComponent(account.organizationSlug)}/billing` : null;
      let email: { subject: string; html: string } | null = null;
      if (reminder.kind === "trial_ends_7" || reminder.kind === "trial_ends_1") {
        const annual = account.cycle === "annual";
        email = trialEndingEmail({ businessName: account.organizationName, planName, priceCents: annual ? annualPriceCents(account) : account.priceCents, annual, freeUntil: reminder.freeUntil, firstInvoiceOn: addDays(reminder.freeUntil, 1) });
      } else if (invoice) {
        email = invoiceReminderEmail(reminder.kind, { businessName: account.organizationName, number: invoice.number, totalCents: invoice.totalCents, owedCents: owedCents(invoice), dueOn: invoice.dueOn, bank, dashboardUrl });
      }
      if (!email) continue;
      if (!(await claimReminder(reminder, account.organizationId))) continue;
      const outcome = await sendEmail({ to: account.billingEmail, from: portpassFrom(), subject: email.subject, html: email.html, log: { template, organizationId: account.organizationId } });
      // Not sent: give the claim back so a second run today can try once more.
      if (outcome === "failed") await releaseReminder(reminder);
    } catch (error) {
      console.error("daily job: billing reminder", error instanceof Error ? error.message : "");
    }
  }
}
