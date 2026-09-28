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
        <span className="brand-mark" aria-hidden="true">P</span>
        <h1>You&rsquo;re offline.</h1>
        <p>Your saved pages are below. Anything you open while connected is kept for next time.</p>
        <SavedPages />
        <a className="primary-button" href="/">Try again →</a>
      </div>
    </main>
  );
}
