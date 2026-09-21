import Link from "next/link";

const CATEGORY_LINKS = [
  { label: "Sports & Fitness", href: "/sports-fitness" },
  { label: "Weddings", href: "/weddings" },
  { label: "Venues", href: "/venues" },
  { label: "Events", href: "/events" },
  { label: "Entertainment", href: "/entertainment" },
];

// The one footer every PortPass-branded page renders. An organization page
// appends its own credit line above this via the orgLine prop, but the
// company name, contact details, and legal links are always the same --
// no page should be missing any of them.
export function SiteFooter({ orgLine }: { orgLine?: string }) {
  return (
    <footer className="site-shell-footer">
      {orgLine && <p className="site-shell-footer-org">{orgLine}</p>}
      <div className="site-shell-footer-main">
        <div>
          <p className="site-shell-footer-name">PortPass Bahamas Technologies · Nassau, The Bahamas</p>
          <p className="site-shell-footer-contact">
            <a href="mailto:portpassbahamas@outlook.com">portpassbahamas@outlook.com</a> · <a href="tel:+12424241262">+1 (242) 424-1262</a>
          </p>
        </div>
        <nav className="site-shell-footer-categories" aria-label="Categories">
          {CATEGORY_LINKS.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
      </div>
      <div className="site-shell-footer-legal">
        <nav aria-label="More">
          <Link href="/apply">For business</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <span>© {new Date().getFullYear()} PortPass Bahamas Technologies</span>
      </div>
    </footer>
  );
}
