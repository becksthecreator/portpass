import Link from "next/link";

export const metadata = {
  title: "Page not found | PortPass Bahamas",
};

const CATEGORIES = [
  { href: "/sports-fitness", label: "Sports & Fitness" },
  { href: "/weddings", label: "Weddings" },
  { href: "/venues", label: "Venues" },
  { href: "/events", label: "Events" },
  { href: "/entertainment", label: "Entertainment" },
];

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="dashboard-empty" style={{ maxWidth: 560, textAlign: "center" }}>
        <Link className="brand" href="/" style={{ justifyContent: "center", marginBottom: 24 }}>
          <span className="brand-mark">P</span><span>PORTPASS</span>
        </Link>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "2.4rem", fontWeight: 400, margin: "0 0 12px" }}>That page doesn&rsquo;t exist.</h1>
        <p>It may have moved, or the link might be mistyped. Here&rsquo;s where you probably meant to go:</p>
        <nav style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, margin: "22px 0 28px" }} aria-label="Browse categories">
          {CATEGORIES.map((c) => (
            <Link key={c.href} href={c.href} className="header-link">{c.label}</Link>
          ))}
        </nav>
        <Link className="primary-button" href="/">Back to PortPass →</Link>
      </div>
    </main>
  );
}
