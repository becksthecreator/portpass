"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getInstallEvent, INSTALLABLE_EVENT, installGuide, isStandalone, type BeforeInstallPromptEvent, type InstallGuide } from "@/lib/pwa";
import { ShareGlyph } from "./PwaRegister";
import "./install-prompt.css";

// "Add PortPass to your home screen" (brief 18, F4): on the account page
// and after a registration. One tap where the browser offers an install
// prompt (Android Chrome, Edge, Samsung Internet, desktop Chrome); the
// right steps for the device everywhere else. Says nothing inside the
// installed app. /app has the same steps with drawings.
export function InstallPrompt({ heading = "Add PortPass to your home screen", lead }: { heading?: string; lead?: string }) {
  const [guide, setGuide] = useState<InstallGuide | "pending">("pending");
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device is only known in the browser, after hydration
    setGuide(isStandalone() ? "installed" : installGuide(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
    // PwaRegister (root layout) catches the browser's prompt, often before
    // this is on screen, and keeps it for whoever asks.
    const pick = () => setEvent(getInstallEvent());
    pick();
    const onInstalled = () => setDone(true);
    window.addEventListener(INSTALLABLE_EVENT, pick);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener(INSTALLABLE_EVENT, pick);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (guide === "pending" || guide === "installed") return null;

  async function install() {
    if (!event) return;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === "accepted") setDone(true);
    } catch {
      // The browser declined to show its prompt: the steps below still work.
    }
    setEvent(null);
  }

  return (
    <section className="install-prompt" aria-labelledby="install-prompt-title">
      <h2 id="install-prompt-title">{heading}</h2>
      {done ? (
        <p>Installed. Look for PortPass on your home screen.</p>
      ) : (
        <>
          <p>{lead ?? "Open your bookings and your Member Pass in one tap, even with no signal. Nothing to download from a store."}</p>
          {event ? (
            <button className="primary-button" type="button" onClick={() => void install()}>Install PortPass</button>
          ) : guide === "ios-safari" ? (
            <ol>
              <li>Tap the <b>Share</b> button <ShareGlyph className="install-prompt-glyph" /> at the bottom of Safari.</li>
              <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            </ol>
          ) : guide === "ios-other" ? (
            <ol>
              <li>Open <b>portpassbahamas.com</b> in <b>Safari</b> (on iPhone only Safari can add it).</li>
              <li>Tap <b>Share</b> <ShareGlyph className="install-prompt-glyph" />, then <b>Add to Home Screen</b>.</li>
            </ol>
          ) : guide === "android" ? (
            <ol>
              <li>Open the browser menu <b>⋮</b>.</li>
              <li>Tap <b>Install app</b> (some phones say <b>Add to Home screen</b>).</li>
            </ol>
          ) : (
            <p>On your phone, open <b>portpassbahamas.com/app</b> and follow the steps for iPhone or Android.</p>
          )}
          <p className="install-prompt-more"><Link href="/app">See the steps with pictures →</Link></p>
        </>
      )}
    </section>
  );
}
