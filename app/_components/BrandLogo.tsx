// The PortPass logo, everywhere a header or footer shows it (Harbour
// Signal, 28 Sept). The Prow logo files from PortPass-Logo-Files.zip live
// in public/brand/ as delivered -- never redrawn in CSS, never the wordmark
// set in live text. Both colour versions render and CSS shows the right
// one for the ground (.brand-logo-light on white, .brand-logo-dark on
// navy: Night, the footer, the admin bar, staff headers).
//
// Rules from the logo README: clear space equal to the height of the P,
// never under 120px wide on screen, never stretched, rotated or recoloured.
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`brand-logo brand-logo-light ${className}`.trim()} src="/brand/logo/portpass-logo-horizontal-light.svg" alt="PortPass Bahamas" width={166} height={36} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`brand-logo brand-logo-dark ${className}`.trim()} src="/brand/logo/portpass-logo-horizontal-dark.svg" alt="PortPass Bahamas" width={166} height={36} />
      {/* Below 400px the public header shows the mark alone (the horizontal
          logo is never shown under 120px wide); CSS swaps these in. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo-mark brand-logo-mark-light" src="/brand/logo/portpass-mark-light.svg" alt="PortPass Bahamas" width={34} height={34} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-logo-mark brand-logo-mark-dark" src="/brand/logo/portpass-mark-dark.svg" alt="PortPass Bahamas" width={34} height={34} />
    </>
  );
}
