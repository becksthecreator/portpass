import Link from "next/link";

export type Crumb = { label: string; href: string };

const CATEGORY_LINKS: Crumb[] = [
  { label: "Sports & Fitness", href: "/sports-fitness" },
  { label: "Weddings", href: "/weddings" },
  { label: "Venues", href: "/venues" },
  { label: "Events", href: "/events" },
  { label: "Entertainment", href: "/entertainment" },
];

// The one header every PortPass-branded page renders -- homepage included.
// Category links always go to the category hub, never to an in-page
// anchor, so every category is one click from anywhere on the site. The
// only exception is BWS (app/weddings/bahamas-by-the-sea and its
// children), which keeps its own chrome until it moves to its own domain.
export function SiteHeader({ breadcrumb }: { breadcrumb?: Crumb[] }) {
  return (
    <header className="site-shell-header">
      <div className="site-shell-header-top">
        <Link className="site-shell-brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <nav className="site-shell-nav" aria-label="Categories">
          {CATEGORY_LINKS.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
        <Link className="site-shell-business" href="/apply">For business</Link>
      </div>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="site-shell-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">PortPass</Link>
          {breadcrumb.map((crumb) => (
            <span key={crumb.href}> / <Link href={crumb.href}>{crumb.label}</Link></span>
          ))}
        </nav>
      )}
    </header>
  );
}
