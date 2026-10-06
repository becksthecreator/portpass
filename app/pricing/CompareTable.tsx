"use client";

import { useEffect, useState } from "react";

// The plan comparison: open on a desktop, folded on a phone (pricing brief,
// 28 Sept). A <details> can't be "open only above 768px" in CSS alone, so
// it renders open (what search engines and desktops see) and folds itself
// after hydration on a narrow screen.
export function CompareTable({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- folds after hydration on a narrow screen (see above)
    if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  }, []);
  return (
    <details className="pricing-compare" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><h2>{title}</h2></summary>
      <div className="pricing-compare-scroll">{children}</div>
    </details>
  );
}
