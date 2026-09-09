"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", background: "var(--sand)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div className="dashboard-empty" style={{ maxWidth: 520 }}>
        <Link className="brand" href="/" style={{ justifyContent: "center", marginBottom: 24 }}>
          <span className="brand-mark">P</span><span>PORTPASS</span>
        </Link>
        <h3>Something went wrong.</h3>
        <p>This page hit an unexpected error. Try again, or head back to the homepage.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="primary-button" type="button" onClick={() => reset()}>Try again</button>
          <Link className="primary-button" href="/">Back to PortPass →</Link>
        </div>
      </div>
    </main>
  );
}
