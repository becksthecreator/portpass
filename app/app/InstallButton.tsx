"use client";

import { useEffect, useState } from "react";
import { isIosSafari, isStandalone, type BeforeInstallPromptEvent } from "@/lib/pwa";

// On /app: a real Install button where the browser offers a prompt
// (Android Chrome, desktop Chrome/Edge), a nudge to the iPhone steps on
// Safari, and a "you already have it" line inside the installed app.
// pwa_installed is tracked once, by PwaRegister in the root layout.
export function InstallButton() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [state, setState] = useState<"idle" | "standalone" | "ios" | "installed">("idle");

  useEffect(() => {
    if (isStandalone()) {
      setState("standalone");
      return;
    }
    if (isIosSafari()) setState("ios");
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setState("installed");
      setEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "standalone") return <p className="app-installed">You&rsquo;re already using the PortPass app.</p>;
  if (state === "installed") return <p className="app-installed">Installed. Look for PortPass on your home screen.</p>;
  if (event) {
    return (
      <button
        className="home-button"
        type="button"
        onClick={() => {
          void event.prompt().catch(() => undefined);
        }}
      >
        Install PortPass
      </button>
    );
  }
  if (state === "ios") return <p className="app-installed">On iPhone: follow the three Safari steps below.</p>;
  return null;
}
