"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Me =
  | { signedIn: false }
  | { signedIn: true; name: string; initials: string; destinations: { href: string; label: string; detail: string; kind: string }[] };

// Fetched after hydration rather than read in the (server) header so the
// many statically rendered pages stay static. Renders nothing until it
// knows, then either "Sign in" or the initials avatar with its menu.
export function HeaderAccount({ enabled }: { enabled: boolean }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((data: Me) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe({ signedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled || me === null) return null;
  if (!me.signedIn) return <Link className="hdr-signin" href="/login">Sign in</Link>;

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  }

  const admin = me.destinations.find((d) => d.kind === "admin");
  const businesses = me.destinations.filter((d) => d.kind === "business");

  return (
    <div className="hdr-account" ref={rootRef}>
      <button className="hdr-avatar" type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${me.name}`} onClick={() => setOpen((o) => !o)}>
        {me.initials}
      </button>
      {open && (
        <div className="hdr-menu" role="menu">
          <p className="hdr-menu-name">{me.name}</p>
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)}>My account</Link>
          {businesses.map((b) => (
            <Link key={b.href} role="menuitem" href={`/api/auth/go?to=${encodeURIComponent(b.href)}`} onClick={() => setOpen(false)}>{b.label}</Link>
          ))}
          {admin && <Link role="menuitem" href={`/api/auth/go?to=${encodeURIComponent(admin.href)}`} onClick={() => setOpen(false)}>PortPass admin</Link>}
          <button role="menuitem" type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
      )}
    </div>
  );
}
