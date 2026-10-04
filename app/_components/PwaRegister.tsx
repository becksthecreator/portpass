"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { installBannerSnoozed, isIosSafari, isStandalone, rememberInstallEvent, snoozeInstallBanner, type BeforeInstallPromptEvent } from "@/lib/pwa";

const SHOW_AFTER_MS = 4000;

// Pages where "Get the app" would be noise: /app explains it already, and
// staff, admin, account and sign-in screens are not where a visitor is.
const QUIET_PREFIXES = ["/app", "/offline", "/admin", "/organizations", "/account", "/login", "/signup", "/where-to", "/business/", "/futprep/staff", "/futprep/my", "/weddings/admin", "/weddings/staff"];

// Mounted once in the root layout (round 5, §6): registers the service
// worker, counts opens from the home screen, and shows the "Get the
// PortPass app" banner -- Android's own install prompt where the browser
// offers one, a Share → Add to Home Screen note on iPhone Safari. Dismissed
// is remembered for 30 days; installed hides it for good.
export function PwaRegister() {
  const pathname = usePathname();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");

  useEffect(() => {
    // PortPass's own hosts only: a business's custom domain renders through
    // the same layout, and its visitors should not get a PortPass-branded
    // app for that site.
    if (!("serviceWorker" in navigator)) return;
    if (!/(^|\.)portpassbahamas\.com$|\.vercel\.app$|^localhost$/.test(window.location.hostname)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("source") === "pwa") track("pwa_open");
  }, []);

  useEffect(() => {
    if (isStandalone()) return;
    const snoozed = installBannerSnoozed();
    let timer: number | null = null;
    const onInstalled = () => {
      track("pwa_installed");
      snoozeInstallBanner();
      setMode("hidden");
      setInstallEvent(null);
      rememberInstallEvent(null);
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      // Kept for the install prompts on the account page and confirmations.
      rememberInstallEvent(event as BeforeInstallPromptEvent);
      if (!snoozed) timer = window.setTimeout(() => setMode("android"), SHOW_AFTER_MS);
    };
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    if (!snoozed && isIosSafari()) timer = window.setTimeout(() => setMode("ios"), SHOW_AFTER_MS);
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  if (mode === "hidden" || QUIET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const dismiss = () => {
    snoozeInstallBanner();
    setMode("hidden");
  };

  const install = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "dismissed") snoozeInstallBanner();
    } catch {
      // the browser declined to show its prompt; nothing else to do
    }
    setMode("hidden");
    setInstallEvent(null);
  };

  return (
    <div className="pwa-banner" role="dialog" aria-label="Get the PortPass app">
      <span className="pwa-banner-mark" aria-hidden="true">P</span>
      <div className="pwa-banner-copy">
        <strong>Get the PortPass app</strong>
        {mode === "android" ? (
          <p>Sessions, venues and bookings, one tap from your home screen.</p>
        ) : (
          <p>
            Tap <ShareGlyph /> Share, then <b>Add to Home Screen</b>.
          </p>
        )}
      </div>
      <div className="pwa-banner-actions">
        {mode === "android" ? (
          <button className="pwa-banner-install" type="button" onClick={() => void install()}>Install</button>
        ) : (
          <Link className="pwa-banner-install" href="/app" onClick={dismiss}>Show me</Link>
        )}
        <button className="pwa-banner-dismiss" type="button" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}

export function ShareGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M5 11v9h14v-9" />
    </svg>
  );
}
