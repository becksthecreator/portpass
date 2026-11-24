import { BrandLogo } from "@/app/_components/BrandLogo";
import Link from "next/link";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SECTIONS } from "@/lib/sections";

const NOT_FOUND_TITLE = "Page not found | PortPass Bahamas";
const NOT_FOUND_DESCRIPTION = "That page doesn't exist on PortPass. Search for what you need, or tell us about your business.";

// Its own title, description and share text, so a 404 never shows the
// home page's (pre-ads audit, 24 Nov), and never indexed.
export const metadata = {
  title: NOT_FOUND_TITLE,
  description: NOT_FOUND_DESCRIPTION,
  robots: { index: false },
  openGraph: { title: NOT_FOUND_TITLE, description: NOT_FOUND_DESCRIPTION },
  twitter: { title: NOT_FOUND_TITLE, description: NOT_FOUND_DESCRIPTION },
};

// Static on purpose: reading sections from the database made this page
// dynamic, and a dynamic not-found streams in after an empty shell, so
// curl, crawlers without JavaScript and slow phones saw a blank 404. The
// compiled section list is what the nav falls back to anyway. Being static,
// it can't tell which sections are hidden (a hidden section's page is
// itself a 404 or an off-site redirect), so it names them as text and
// links only to pages that always exist.
export default function NotFound() {
  const kinds = SECTIONS.map((s) => s.name).join(" · ");
  return (
    <main className={`${ppDisplay.variable} ${ppSans.variable}`} style={{ minHeight: "100vh", background: "var(--deck)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="dashboard-empty" style={{ maxWidth: 560, textAlign: "center" }}>
        <Link className="brand" href="/" style={{ justifyContent: "center", marginBottom: 24 }}>
          <BrandLogo />
        </Link>
        <h1 style={{ fontFamily: "var(--font-pp-display), Archivo, sans-serif", fontStretch: "112%", fontSize: "2.4rem", fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 12px" }}>That page doesn&rsquo;t exist.</h1>
        <p>It may have moved, or the link might be mistyped. Here&rsquo;s where you probably meant to go:</p>
        <nav style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, margin: "22px 0 12px" }} aria-label="Where to go">
          <Link href="/search" className="header-link">Search PortPass</Link>
          <Link href="/app" className="header-link">Get the app</Link>
        </nav>
        <p style={{ margin: "0 0 28px", fontSize: ".9rem", color: "var(--muted)" }}>For every kind of business: {kinds}.</p>
        <Link className="primary-button" href="/">Back to PortPass →</Link>
        <p style={{ marginTop: 22, fontSize: ".9rem" }}>
          Run a business? <Link href="/apply" style={{ color: "var(--harbour)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>List your business →</Link>
        </p>
      </div>
    </main>
  );
}
