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
