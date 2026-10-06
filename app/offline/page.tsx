import { BrandLogo } from "@/app/_components/BrandLogo";
import { SavedPages } from "./SavedPages";

// The service worker's fallback when a page can't be fetched. Deliberately
// self-contained -- no header, footer or database -- so it precaches
// cleanly and renders from cache with nothing else available.
export const metadata = {
  title: "You’re offline | PortPass Bahamas",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <div className="offline-card">
        <div className="offline-brand"><BrandLogo /></div>
        <h1>You&rsquo;re offline.</h1>
        <p>Your saved pages are below. Anything you open while connected is kept for next time.</p>
        <SavedPages />
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load: Try again has to ask the network, not the router */}
        <a className="primary-button" href="/">Try again →</a>
      </div>
    </main>
  );
}
