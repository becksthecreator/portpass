import Link from "next/link";
import { paymentVolumeReport } from "@/db/paymentRequests";
import { requireAdmin } from "@/lib/auth/admin";
import { nassauToday } from "@/lib/futprepTerms";
import { money, monthLabel, type VolumeRow } from "@/lib/paymentRequests/rules";
import { AdminShell } from "../_components/AdminShell";
import "@/app/_components/payments/payments.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Payments | PortPass admin",
  robots: { index: false, follow: false },
};

function sum(rows: VolumeRow[], key: keyof Omit<VolumeRow, "month" | "organizationId">): number {
  return rows.reduce((total, r) => total + r[key], 0);
}

// Admin -> Payments (brief 17, §4): payment volume through PortPass, by
// month and by business, for the Kanoo conversation and for invoicing
// later. Numbers only: what each business requested and recorded as paid.
// PortPass never touched the money, and nothing here shows a customer or
// their bank details.
export default async function AdminPaymentsPage() {
  const session = await requireAdmin("/admin/payments");
  const { rows, businesses } = await paymentVolumeReport();
  const thisMonth = nassauToday().slice(0, 7);
  const current = rows.filter((r) => r.month === thisMonth);
  const months = [...new Set(rows.map((r) => r.month))];
  const name = (id: number) => businesses.get(id)?.name ?? `Business ${id}`;

  return (
    <AdminShell session={session} current="/admin/payments" title="Payments" lede="Payment requests across every business. Customers pay each business directly; these are the amounts businesses requested and recorded. Fees are invoiced from these numbers later, never deducted.">
      <dl className="admin-preq-totals" aria-label={`${monthLabel(thisMonth)} so far`}>
        <div><dt>Requests sent, {monthLabel(thisMonth)}</dt><dd>{sum(current, "requestsSent")}</dd></div>
        <div><dt>Amount requested</dt><dd>{money(sum(current, "requestedCents"))}</dd></div>
        <div><dt>Recorded as paid</dt><dd>{money(sum(current, "recordedPaidCents"))}</dd></div>
        <div><dt>Outstanding on them</dt><dd>{money(sum(current, "outstandingCents"))}</dd></div>
        <div><dt>Recorded as paid, all time</dt><dd>{money(sum(rows, "recordedPaidCents"))}</dd></div>
        <div><dt>Recorded outside requests, all time</dt><dd>{money(sum(rows, "otherRecordedCents"))}</dd></div>
      </dl>
      <p className="admin-preq-note">
        Requests and the amount requested count in the month a request was first sent; recorded payments in the month the business says the money came in; outstanding is what is still unpaid today on that month&rsquo;s requests. &ldquo;Outside requests&rdquo; is money recorded straight on a business&rsquo;s own desk (Futprep&rsquo;s registrations and private sessions).
      </p>

      {months.length === 0 ? (
        <p className="admin-empty">No payment requests or recorded payments yet.</p>
      ) : (
        months.map((month) => {
          const monthRows = rows.filter((r) => r.month === month);
          return (
            <section key={month} className="admin-preq-month" aria-labelledby={`preq-month-${month}`}>
              <h2 id={`preq-month-${month}`}>{monthLabel(month)}</h2>
              <div className="admin-preq-scroll">
                <table className="admin-preq-table">
                  <thead>
                    <tr>
                      <th scope="col">Business</th>
                      <th scope="col">Requests sent</th>
                      <th scope="col">Requested</th>
                      <th scope="col">Recorded as paid</th>
                      <th scope="col">Outstanding</th>
                      <th scope="col">Outside requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map((r) => {
                      const slug = businesses.get(r.organizationId)?.slug;
                      return (
                        <tr key={r.organizationId}>
                          <th scope="row">{slug ? <Link href={`/business/${slug}/payments`}>{name(r.organizationId)}</Link> : name(r.organizationId)}</th>
                          <td>{r.requestsSent}</td>
                          <td>{money(r.requestedCents)}</td>
                          <td>{money(r.recordedPaidCents)}</td>
                          <td>{money(r.outstandingCents)}</td>
                          <td>{money(r.otherRecordedCents)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {monthRows.length > 1 && (
                    <tfoot>
                      <tr>
                        <th scope="row">All businesses</th>
                        <td>{sum(monthRows, "requestsSent")}</td>
                        <td>{money(sum(monthRows, "requestedCents"))}</td>
                        <td>{money(sum(monthRows, "recordedPaidCents"))}</td>
                        <td>{money(sum(monthRows, "outstandingCents"))}</td>
                        <td>{money(sum(monthRows, "otherRecordedCents"))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
          );
        })
      )}
    </AdminShell>
  );
}
