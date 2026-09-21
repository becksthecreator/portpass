import Link from "next/link";

// Shared nav for every templated Organization/Offering page. Deliberately
// minimal -- no internal links (staff login etc.) belong here; see
// TemplateFooter for where those go instead.
export function TemplateHeader({ orgName, orgHref }: { orgName: string; orgHref: string }) {
  return (
    <header className="tpl-header">
      <Link className="tpl-header-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
      <Link className="tpl-header-org" href={orgHref}>{orgName}</Link>
    </header>
  );
}
