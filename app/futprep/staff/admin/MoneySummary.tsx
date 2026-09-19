import type { FutprepMoneySummary } from "@/db/staff";

function money(cents: number) {
  return new Intl.NumberFormat("en-BS", { style: "currency", currency: "BSD", minimumFractionDigits: 0 }).format(cents / 100);
}

// Built directly from getFutprepMoneySummary(), itself built directly from
// registrations + summed payments -- so these numbers can never drift from
// what staff would get summing those two tables by hand.
export function MoneySummary({ summary }: { summary: FutprepMoneySummary }) {
  return (
    <div className="money-summary">
      <div className="staff-summary staff-summary-four">
        <article><span>Expected</span><strong>{money(summary.combined.expectedCents)}</strong></article>
        <article><span>Collected</span><strong>{money(summary.combined.collectedCents)}</strong></article>
        <article><span>Outstanding</span><strong className={summary.combined.outstandingCents > 0 ? "money-outstanding" : undefined}>{money(summary.combined.outstandingCents)}</strong></article>
        <article><span>Families with a balance</span><strong>{summary.combined.countWithBalance} of {summary.combined.count}</strong></article>
      </div>
      {summary.byProgram.length > 1 && (
        <table className="money-summary-table">
          <thead>
            <tr><th>Programme</th><th>Expected</th><th>Collected</th><th>Outstanding</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {summary.byProgram.map((bucket) => (
              <tr key={bucket.programSlug}>
                <td>{bucket.programName}</td>
                <td>{money(bucket.expectedCents)}</td>
                <td>{money(bucket.collectedCents)}</td>
                <td className={bucket.outstandingCents > 0 ? "money-outstanding" : undefined}>{money(bucket.outstandingCents)}</td>
                <td>{bucket.countWithBalance} of {bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
