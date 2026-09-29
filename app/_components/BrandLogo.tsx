// The PortPass logo, everywhere a header or footer shows it (Harbour
// Signal, 28 Sept). The Prow logo files from PortPass-Logo-Files.zip go in
// public/brand/ as they are -- never redrawn in CSS, never the wordmark
// set in live text. Both colour versions render and CSS shows the right
// one for the ground (.brand-logo-light on white, .brand-logo-dark on
// navy: Night, the footer, the admin bar, staff headers).
//
// Until the files are in the repo LOGO_FILES_READY stays false and the
// interim mark renders, so nothing approximates the real logo.
const LOGO_FILES_READY = false;

export function BrandLogo({ className = "" }: { className?: string }) {
  if (!LOGO_FILES_READY) {
    return (
      <>
        <span className="brand-mark" aria-hidden="true">P</span>
        <span className="brand-word">PORTPASS</span>
      </>
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`brand-logo brand-logo-light ${className}`.trim()} src="/brand/logo/portpass-logo-horizontal-light.svg" alt="PortPass Bahamas" height={36} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`brand-logo brand-logo-dark ${className}`.trim()} src="/brand/logo/portpass-logo-horizontal-dark.svg" alt="PortPass Bahamas" height={36} />
    </>
  );
}
