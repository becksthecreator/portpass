import Link from "next/link";
import { authUiEnabled } from "@/lib/auth/env";
import { getNavSections } from "@/lib/navSections";
import { HeaderAccount } from "./HeaderAccount";

export type Crumb = { label: string; href: string };

const SITE_URL = "https://portpassbahamas.com";

// The one header every PortPass-branded page renders -- homepage included.
// Category links always go to the category hub, never to an in-page
// anchor, so every category is one click from anywhere on the site. The
// only exception is BWS's planner (app/weddings/bahamas-weddings-by-the-sea/
// plan), which keeps its own bws-theme chrome rather than this header.
//
// On a phone the five section links wrapped onto two lines and the
// "← back" row added a third, pushing every page down ~130px (round 4,
// item 4). Now: one row -- brand, a "Browse" menu (a <details>, so no
// JavaScript), account, For business -- and the back row is desktop-only.
// The BreadcrumbList JSON-LD is unchanged, so search results still get
// the trail.
export async function SiteHeader({ breadcrumb }: { breadcrumb?: Crumb[] }) {
  const categoryLinks = await getNavSections();
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
        <nav className="site-shell-nav" aria-label="Categories">
          {categoryLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
        <details className="site-shell-browse">
          <summary>Browse <span aria-hidden="true">▾</span></summary>
          <nav aria-label="Categories">
            {categoryLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
          </nav>
        </details>
        <div className="site-shell-header-actions">
          <HeaderAccount enabled={authUiEnabled()} />
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
