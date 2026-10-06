"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { unlockHref } from "@/lib/memberPerks";

// The button under a perk. The pages it sits on are built once and served
// to everyone, so it starts as "Sign up free to unlock" (true for nearly
// every visitor) and, once the browser has asked who is signed in, becomes
// "Show your Member Pass" for a member. After sign-up the visitor comes
// back to the page they were on.
export function PerkUnlock({ path, className = "perk-unlock" }: { path?: string; className?: string }) {
  const pathname = usePathname();
  const [member, setMember] = useState(false);
  // On a business's own domain the links go to PortPass itself, and back
  // to the business's page there.
  const [base, setBase] = useState("");

  useEffect(() => {
    const host = window.location.hostname;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the host is only known in the browser; the page is built once for everyone
    if (!(host === "portpassbahamas.com" || host.endsWith(".portpassbahamas.com") || host.endsWith(".vercel.app") || host === "localhost" || host === "127.0.0.1")) setBase("https://portpassbahamas.com");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { signedIn: false }))
      .then((data: { signedIn?: boolean }) => {
        if (!cancelled) setMember(data.signedIn === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (member) return <Link className={className} href={`${base}/pass`} prefetch={false}>You&rsquo;re a member: show your Member Pass <span aria-hidden="true">→</span></Link>;
  return <Link className={className} href={`${base}${unlockHref(path ?? pathname ?? "/perks")}`} prefetch={false}>Sign up free to unlock <span aria-hidden="true">→</span></Link>;
}
