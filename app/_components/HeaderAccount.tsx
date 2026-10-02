"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearStoredPass } from "@/lib/memberPassClient";

type Me =
  | { signedIn: false }
  | { signedIn: true; name: string; initials: string; destinations: { href: string; label: string; detail: string; kind: string }[] };

// "Sign in" renders straight away -- on the server and at first paint --
// so it is findable on every page at every width (the 28 Sept brief: nobody
// could find it). Who is actually signed in is fetched after hydration,
// so the many statically rendered pages stay static; once known, a
// signed-in visitor gets the initials avatar and its menu instead:
// My account · My business(es) · PortPass Admin (platform roles) · Sign out.
export function HeaderAccount() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

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

  if (!me || !me.signedIn) {
    // The sign-in and sign-up pages are the door itself.
    if (pathname === "/login" || pathname === "/signup") return null;
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return <Link className="hdr-signin" href={`/login${next}`}>Sign in</Link>;
  }

  async function signOut() {
    clearStoredPass();
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
          <Link role="menuitem" href="/pass" onClick={() => setOpen(false)}>Member Pass</Link>
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
