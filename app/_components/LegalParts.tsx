import { legalDate, legalHeading, type LegalDocument } from "@/lib/legal";

// Shared furniture for /privacy and /terms (brief 16, D): the version and
// date line, the attorney-review note at the top, and the changelog block
// at the bottom.

export function LegalVersionLine({ doc }: { doc: LegalDocument }) {
  return (
    <div className="eyebrow">
      <span className="eyebrow-dot" />
      {legalHeading(doc)}
    </div>
  );
}

export function AttorneyReviewNote() {
  return (
    <aside className="legal-review-note" role="note" aria-label="Attorney review">
      <strong>Being reviewed by our attorney.</strong>{" "}
      This version is in effect now. Our attorney is reviewing it, and the wording may change after that review. Any change will be dated and listed under{" "}
      <a href="#changelog">What changed</a> at the bottom of this page. If a change affects your rights, we will email account holders first.
    </aside>
  );
}

export function LegalChangelog({ doc }: { doc: LegalDocument }) {
  return (
    <section className="legal-changelog" id="changelog" aria-labelledby="changelog-heading">
      <h2 id="changelog-heading">What changed</h2>
      <p className="legal-changelog-updated">Last updated {legalDate(doc.updated)}.</p>
      <ol>
        {doc.changelog.map((entry) => (
          <li key={entry.version}>
            <h3>
              Version {entry.version} <span>· {legalDate(entry.date, entry.version === 1)}</span>
            </h3>
            <ul>
              {entry.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
