"use client";

import { useState } from "react";

export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="bws-menu-toggle" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
        Menu <span aria-hidden="true">☰</span>
      </button>
      <nav className={`bws-mobile-menu${open ? " bws-is-open" : ""}`} id="mobile-menu" aria-label="Mobile navigation">
        {links.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</a>
        ))}
      </nav>
    </>
  );
}
