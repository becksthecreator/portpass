import Link from "next/link";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_PHONE_E164, PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";
import { getNavSections } from "@/lib/navSections";
import { listPublishedGuides } from "@/db/guides";
import { PRICE_CURRENCY_LINE } from "./blocks/format";

// The one footer every PortPass-branded page renders. An organization page
// appends its own credit line above this via the orgLine prop, but the
// company name, contact details, and legal links are always the same --
// no page should be missing any of them.
export async function SiteFooter({ orgLine }: { orgLine?: string }) {
  // "Guides" appears only once a guide is published (brief 18, A5); a
  // failed read shows none.
  const [categoryLinks, guides] = await Promise.all([getNavSections(), listPublishedGuides()]);
  return (
    <footer className="site-shell-footer">
      {orgLine && <p className="site-shell-footer-org">{orgLine}</p>}
      <div className="site-shell-footer-main">
        <div>
          <p className="site-shell-footer-name">PortPass Bahamas Technologies · Nassau, The Bahamas</p>
          <p className="site-shell-footer-contact">
            <a href={`mailto:${PORTPASS_SUPPORT_EMAIL}`}>{PORTPASS_SUPPORT_EMAIL}</a> · <a href={`tel:${PORTPASS_PHONE_E164}`}>{PORTPASS_PHONE_DISPLAY}</a>
          </p>
        </div>
        <nav className="site-shell-footer-categories" aria-label="Sections">
          {categoryLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
      </div>
      <p className="site-shell-footer-prices">{PRICE_CURRENCY_LINE}</p>
      <div className="site-shell-footer-legal">
        <nav aria-label="More">
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Create an account</Link>
          <Link href="/apply">For business</Link>
          <Link href="/pricing">Pricing</Link>
          {guides.length > 0 && <Link href="/guides">Guides</Link>}
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
