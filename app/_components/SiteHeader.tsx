import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { getSiteContent } from "@/db/siteContent";
import { getNavTree } from "@/lib/navSections";
import { announcementVisible, nassauDay } from "@/lib/siteContent";
import { HeaderAccount } from "./HeaderAccount";
import { SiteNav } from "./SiteNav";
import { HeaderMotion } from "./motion/HeaderMotion";
import { TIDE } from "./motion/PageTransition";
import { jsonLdString } from "@/lib/seo/jsonLd";

export type Crumb = { label: string; href: string };

const SITE_URL = "https://portpassbahamas.com";

// With the horizontal logo, brand · Browse · Sign in · Pricing · For
// business need about 481px in one row, so the header shows the mark on
// every phone (401-440px included), not just under 400px. Keep in step
// with the max-width:519px rule for .site-shell-brand in globals.css.
const HEADER_MARK_QUERY = "(max-width: 519px)";

// The one header every PortPass-branded page renders -- homepage included.
// The only exception is BWS's planner (app/weddings/bahamas-weddings-by-the-sea/
// plan), which keeps its own bws-theme chrome rather than this header.
//
// Sections come from the categories table (lib/navSections.getNavTree) and
// render through SiteNav: dropdown panels per section from 1380px up, a
// "Browse" bottom sheet below that (round 5, §2-3). On a phone the header
// stays one row -- mark, Browse, account, Pricing, For business, with
// Pricing left to the Browse sheet and footer under 375px -- and the
// "← back" row is desktop-only (round 4, item 4). The BreadcrumbList
// JSON-LD is unchanged, so search results still get the trail.
// `tide` (brief 22, M4): on the main public pages (home, the sections,
// pricing, about) the brand, the section links, Pricing and a "back" link to
// another main page carry the "tide" transition type, and the invisible
// panel the Tide Wipe slides across is rendered (lib/motion/public.css).
// Everywhere else the header's links carry no type and move nothing.
export async function SiteHeader({ breadcrumb, tide = false }: { breadcrumb?: Crumb[]; tide?: boolean }) {
  // The announcement bar (Admin -> Content): one line above the header on
  // every PortPass page, until its last day or until it is switched off.
  // Its link is never prefetched: it is on every page, and a prefetch of a
  // business's page must not count as a visit that came from PortPass.
  const [sections, { announcement }] = await Promise.all([getNavTree(), getSiteContent()]);
  const announce = announcementVisible(announcement, nassauDay()) ? announcement : null;
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

  const tideTypes = tide ? TIDE : undefined;
  const backTypes = tide && back && (back.href === "/" || sections.some((section) => section.href === back.href)) ? TIDE : undefined;

  const schemaTrail = breadcrumb && breadcrumb.length > 0 ? [{ label: "PortPass", href: "/" }, ...breadcrumb] : [];

  return (
    <>
    {announce && (
      <p className="site-announcement" role="note">
        <span>{announce.text}</span>
        {announce.href && (announce.href.startsWith("/") ? <Link href={announce.href} prefetch={false}>{announce.linkLabel}</Link> : <a href={announce.href} rel="noopener">{announce.linkLabel}</a>)}
      </p>
    )}
    {tide && <div className="tide-panel" aria-hidden="true" />}
    <header className="site-shell-header">
      <HeaderMotion />
      <div className="site-shell-header-top">
        <Link className="site-shell-brand" href="/" transitionTypes={tideTypes}><BrandLogo markQuery={HEADER_MARK_QUERY} /></Link>
        <SiteNav sections={sections} tide={tide} />
        <div className="site-shell-header-actions">
          <HeaderAccount />
          <Link className="site-shell-for-business site-shell-pricing" href="/pricing" transitionTypes={tideTypes}>Pricing</Link>
          <Link className="site-shell-for-business" href="/apply">For business</Link>
        </div>
      </div>
      {back && (
        <nav className="site-shell-breadcrumb" aria-label="Breadcrumb">
          <Link href={back.href} transitionTypes={backTypes}><span aria-hidden="true">←</span> {back.label}</Link>
        </nav>
      )}
      {schemaTrail.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString({
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
    </>
  );
}
