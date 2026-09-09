import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="dashboard-empty" style={{ maxWidth: 520 }}>
        <Link className="brand" href="/" style={{ justifyContent: "center", marginBottom: 24 }}>
          <span className="brand-mark">P</span><span>PORTPASS</span>
        </Link>
        <h3>Page not found.</h3>
        <p>The page you're looking for doesn't exist or may have moved.</p>
        <Link className="primary-button" href="/">Back to PortPass →</Link>
      </div>
    </main>
  );
}
