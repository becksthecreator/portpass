import Link from "next/link";
import { PORTPASS_PHONE_DISPLAY, PORTPASS_PHONE_E164, PORTPASS_SUPPORT_EMAIL } from "@/lib/contact";
import { getNavSections } from "@/lib/navSections";

// The one footer every PortPass-branded page renders. An organization page
// appends its own credit line above this via the orgLine prop, but the
// company name, contact details, and legal links are always the same --
// no page should be missing any of them.
export async function SiteFooter({ orgLine }: { orgLine?: string }) {
  const categoryLinks = await getNavSections();
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
        <nav className="site-shell-footer-categories" aria-label="Categories">
          {categoryLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
      </div>
      <div className="site-shell-footer-legal">
        <nav aria-label="More">
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Create an account</Link>
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
