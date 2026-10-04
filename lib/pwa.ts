// Browser-side helpers for the installable app (round 5, §6). Client-only:
// every function reads window/navigator and must be called from an effect.

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Already running from the home screen (Android and desktop report the
// display mode; iOS Safari sets navigator.standalone).
export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// iPhone/iPad Safari has no install prompt, so the banner explains
// Share → Add to Home Screen instead. Other iOS browsers can't install a
// web app at all, so they get nothing.
export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua);
  return ios && safari;
}

const DISMISS_KEY = "portpass.install.dismissedAt";
export const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

export function installBannerSnoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

export function snoozeInstallBanner() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // private mode or storage blocked: the banner simply shows again next visit
  }
}

// The browser's install prompt fires once, early, and PwaRegister (root
// layout) catches it. It is kept here so a screen that appears later (the
// account page, a registration's confirmation) can still offer the real
// Install button (brief 18, F4).
export const INSTALLABLE_EVENT = "portpass:installable";
let installEvent: BeforeInstallPromptEvent | null = null;

export function rememberInstallEvent(event: BeforeInstallPromptEvent | null) {
  installEvent = event;
  window.dispatchEvent(new Event(INSTALLABLE_EVENT));
}

export function getInstallEvent(): BeforeInstallPromptEvent | null {
  return installEvent;
}

// Which instructions fit this device when there is no install prompt to
// offer. Pure, so it is tested: iPhone and iPad can add a web app from
// Safari only; Android browsers have it in their menu.
export type InstallGuide = "ios-safari" | "ios-other" | "android" | "desktop" | "installed";

export function installGuide(userAgent: string, platform = "", maxTouchPoints = 0): Exclude<InstallGuide, "installed"> {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (ios) return /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(userAgent) ? "ios-safari" : "ios-other";
  return /Android/.test(userAgent) ? "android" : "desktop";
}
