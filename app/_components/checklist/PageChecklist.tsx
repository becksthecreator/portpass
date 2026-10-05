import Link from "next/link";
import type { BusinessChecklist } from "@/db/pageChecklist";
import { checklistSummary, missingItems, type ChecklistItem } from "@/lib/pageChecklist";
import "./checklist.css";

// "What your page is missing" (brief 19, part D), drawn two ways from the
// same list: for one business on its own home, and for every business in
// one table for PortPass's founders. Each missing item links to where it
// is fixed.

// On the business's home. `canFix`: owners and admins get the links (the
// settings are theirs to change); other team members see the list.
export function MissingFromPage({ items, canFix }: { items: ChecklistItem[]; canFix: boolean }) {
  const missing = missingItems(items);
  const done = items.filter((item) => item.done);
  return (
    <section className="account-section pchk" aria-labelledby="pchk-title">
      <h2 id="pchk-title">What your page is missing</h2>
      {missing.length === 0 ? (
        <p className="auth-lead">Nothing. Your page has everything on the list.</p>
      ) : (
        <>
          <p className="auth-lead">{checklistSummary(items)}. {done.length} of {items.length} done.</p>
          <ul className="pchk-list">
            {missing.map((item) => (
              <li key={item.key}>
                <span className="pchk-mark is-missing" aria-hidden="true">✕</span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                  {canFix && <Link href={item.href}>{item.action} →</Link>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {done.length > 0 && missing.length > 0 && (
        <details className="pchk-done">
          <summary>{done.length} done</summary>
          <ul className="pchk-list">
            {done.map((item) => (
              <li key={item.key}>
                <span className="pchk-mark is-done" aria-hidden="true">✓</span>
                <div><strong>{item.label}</strong><span>{item.detail}</span></div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

// Every business's list in one table (Admin -> Businesses and Admin ->
// Phase 1). A cross links to where that business fixes it; platform staff
// reach those pages through the platform door.
export function ChecklistTable({ lists }: { lists: BusinessChecklist[] }) {
  if (lists.length === 0) return <p className="admin-empty">No businesses yet.</p>;
  return (
    <table className="admin-table pchk-table">
      <thead><tr><th>Business</th><th>Status</th><th>Done</th><th>Missing</th><th>Has</th></tr></thead>
      <tbody>
        {lists.map((list) => {
          const missing = missingItems(list.items);
          const done = list.items.filter((item) => item.done);
          return (
            <tr key={list.organizationId}>
              <td data-label="Business"><Link href={`/business/${list.slug}`}><strong>{list.name}</strong></Link></td>
              <td data-label="Status"><span className={`admin-pill ${list.status}`}>{list.status}</span>{list.isPublished ? " · public" : ""}</td>
              <td data-label="Done">{done.length} of {list.items.length}</td>
              <td data-label="Missing">
                {missing.length === 0 ? "Nothing" : (
                  <ul className="pchk-cells">
                    {missing.map((item) => (
                      <li key={item.key}><span className="pchk-mark is-missing" aria-hidden="true">✕</span><Link href={item.href} title={item.detail}>{item.label}</Link></li>
                    ))}
                  </ul>
                )}
              </td>
              <td data-label="Has">
                {done.length === 0 ? "—" : (
                  <ul className="pchk-cells">
                    {done.map((item) => (
                      <li key={item.key}><span className="pchk-mark is-done" aria-hidden="true">✓</span>{item.label}</li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
