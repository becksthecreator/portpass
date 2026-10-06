// The PortPass logo, everywhere a header or footer shows it (Harbour
// Signal, 28 Sept). The Prow logo files from PortPass-Logo-Files.zip live
// in public/brand/ as delivered -- never redrawn in CSS, never the wordmark
// set in live text. Both colour versions render and CSS shows the right
// one for the ground (.brand-logo-light on white, .brand-logo-dark on
// navy: Night, the footer, the admin bar, staff headers). The show/hide
// classes sit on the <picture>, so the hidden version takes no space in a
// flex header.
//
// Rules from the logo README: clear space equal to the height of the P,
// never under 120px wide on screen, never stretched, rotated or recoloured.
// Under 400px each <picture> swaps to the mark alone, so a narrow header
// keeps its links on one row and a page fetches only the file it shows.
// A header that needs the mark up to a wider screen passes its own
// markQuery (SiteHeader does) along with a matching CSS rule for the
// 30px box.
const MARK_QUERY = "(max-width: 400px)";

export function BrandLogo({ className = "", markQuery = MARK_QUERY }: { className?: string; markQuery?: string }) {
  return (
    <>
      <picture className="brand-logo-light">
        <source media={markQuery} srcSet="/brand/logo/portpass-mark-light.svg" width={34} height={34} />
        <img className={`brand-logo ${className}`.trim()} src="/brand/logo/portpass-logo-horizontal-light.svg" alt="PortPass Bahamas" width={166} height={36} />
      </picture>
      <picture className="brand-logo-dark">
        <source media={markQuery} srcSet="/brand/logo/portpass-mark-dark.svg" width={34} height={34} />
        <img className={`brand-logo ${className}`.trim()} src="/brand/logo/portpass-logo-horizontal-dark.svg" alt="PortPass Bahamas" width={166} height={36} />
      </picture>
    </>
  );
}
