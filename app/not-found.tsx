import Link from "next/link";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SECTIONS } from "@/lib/sections";

export const metadata = {
  title: "Page not found | PortPass Bahamas",
};

// Static on purpose: reading sections from the database made this page
// dynamic, and a dynamic not-found streams in after an empty shell, so
// curl, crawlers without JavaScript and slow phones saw a blank 404. The
// compiled section list is what the nav falls back to anyway.
export default function NotFound() {
  const CATEGORIES = SECTIONS.map((s) => ({ label: s.name, href: s.href }));
  return (
    <main className={`${ppDisplay.variable} ${ppSans.variable}`} style={{ minHeight: "100vh", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="dashboard-empty" style={{ maxWidth: 560, textAlign: "center" }}>
        <Link className="brand" href="/" style={{ justifyContent: "center", marginBottom: 24 }}>
          <span className="brand-mark">P</span><span>PORTPASS</span>
        </Link>
        <h1 style={{ fontFamily: "var(--font-pp-display), Poppins, sans-serif", fontSize: "2.4rem", fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 12px" }}>That page doesn&rsquo;t exist.</h1>
        <p>It may have moved, or the link might be mistyped. Here&rsquo;s where you probably meant to go:</p>
        <nav style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, margin: "22px 0 28px" }} aria-label="Browse categories">
          {CATEGORIES.map((c) => (
            <Link key={c.href} href={c.href} className="header-link">{c.label}</Link>
          ))}
        </nav>
        <Link className="primary-button" href="/">Back to PortPass →</Link>
        <p style={{ marginTop: 22, fontSize: ".9rem" }}>
          Run a business? <Link href="/business" style={{ color: "var(--teal-deep)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 }}>List your business →</Link>
        </p>
      </div>
    </main>
  );
}
