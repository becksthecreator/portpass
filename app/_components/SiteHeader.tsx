import Link from "next/link";
import { getNavTree } from "@/lib/navSections";
import { HeaderAccount } from "./HeaderAccount";
import { SiteNav } from "./SiteNav";

export type Crumb = { label: string; href: string };

const SITE_URL = "https://portpassbahamas.com";

// The one header every PortPass-branded page renders -- homepage included.
// The only exception is BWS's planner (app/weddings/bahamas-weddings-by-the-sea/
// plan), which keeps its own bws-theme chrome rather than this header.
//
// Sections come from the categories table (lib/navSections.getNavTree) and
// render through SiteNav: dropdown panels per section from 1024px up, a
// "Browse" bottom sheet below that (round 5, §2-3). On a phone the header
// stays one row -- brand, Browse, account, For business -- and the "← back"
// row is desktop-only (round 4, item 4). The BreadcrumbList JSON-LD is
// unchanged, so search results still get the trail.
export async function SiteHeader({ breadcrumb }: { breadcrumb?: Crumb[] }) {
  const sections = await getNavTree();
  // The full trail ("PortPass / Weddings / Bahamas Weddings By The Sea")
  // reads like a file path, so only a single link back to the immediate
  // parent is shown -- the offering page's parent is its organization, an
  // organization's parent is Home, matching breadcrumb[length-2] (or Home
  // when there's nothing before the current page).
  const back =
    breadcrumb && breadcrumb.length > 0
      ? breadcrumb.length > 1
        ? breadcrumb[breadcrumb.length - 2]
        : { label: "PortPass", href: "/" }
      : null;

  const schemaTrail = breadcrumb && breadcrumb.length > 0 ? [{ label: "PortPass", href: "/" }, ...breadcrumb] : [];

  return (
    <header className="site-shell-header">
      <div className="site-shell-header-top">
        <Link className="site-shell-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <SiteNav sections={sections} />
        <div className="site-shell-header-actions">
          <HeaderAccount />
          <Link className="site-shell-business" href="/apply">For business</Link>
        </div>
      </div>
      {back && (
        <nav className="site-shell-breadcrumb" aria-label="Breadcrumb">
          <Link href={back.href}><span aria-hidden="true">←</span> {back.label}</Link>
        </nav>
      )}
      {schemaTrail.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: schemaTrail.map((crumb, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: crumb.label,
                item: `${SITE_URL}${crumb.href}`,
              })),
            }),
          }}
        />
      )}
    </header>
  );
}
