import Link from "next/link";
import { ppDisplay, ppSans } from "@/app/fonts";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { ShareGlyph } from "@/app/_components/PwaRegister";
import { InstallButton } from "./InstallButton";

// ISR: the header shows live counts from the database.
export const revalidate = 300;

const TITLE = "Get the PortPass app | PortPass Bahamas";
const DESCRIPTION = "Add PortPass to your home screen on iPhone or Android: sports sessions, weddings, venues and events, one tap away.";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "PortPass Bahamas", title: TITLE, description: DESCRIPTION, url: "https://portpassbahamas.com/app" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// What signs and flyers link to (round 5, §6): the QR points back here,
// and the page walks through adding PortPass to a home screen. The
// drawings are schematic on purpose -- they don't go stale with each OS
// release the way screenshots do.
export default function AppPage() {
  return (
    <main className={`app-page home-theme ${ppDisplay.variable} ${ppSans.variable}`}>
      <SiteHeader breadcrumb={[{ label: "Get the app", href: "/app" }]} />

      <section className="app-hero">
        <div>
          <span className="home-eyebrow">PortPass on your phone</span>
          <h1>Put PortPass on your home screen.</h1>
          <p>The same PortPass, opened like an app: sessions, weddings, venues and events, one tap away and quick to come back to. Nothing to download from a store.</p>
          <InstallButton />
        </div>
        <div className="app-qr">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own SVG route, no optimisation wanted */}
          <img src="/app/qr.svg" alt="QR code that opens portpassbahamas.com/app" width={220} height={220} />
          <span>Scan to open this page on another phone</span>
          <a href="/app/qr.svg" download="portpass-app-qr.svg">Download the QR (SVG, for print)</a>
        </div>
      </section>

      <section className="app-steps" aria-label="How to install">
        <article className="app-platform">
          <h2>iPhone and iPad</h2>
          <p>In Safari (other iPhone browsers can&rsquo;t add web apps).</p>
          <ol>
            <li>Open <b>portpassbahamas.com</b> in Safari.</li>
            <li>Tap the <b>Share</b> button <ShareGlyph className="app-inline" /> at the bottom of the screen.</li>
            <li>Scroll the list and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          </ol>
          <div className="app-shot">
            <IphoneShareDrawing />
          </div>
        </article>

        <article className="app-platform">
          <h2>Android</h2>
          <p>In Chrome, Edge or Samsung Internet.</p>
          <ol>
            <li>Open <b>portpassbahamas.com</b>.</li>
            <li>Tap <b>Install</b> on the &ldquo;Get the PortPass app&rdquo; banner when it appears.</li>
            <li>Or open the browser menu <b>⋮</b> and tap <b>Install app</b> (sometimes called <b>Add to Home screen</b>).</li>
          </ol>
          <div className="app-shot">
            <AndroidMenuDrawing />
          </div>
        </article>
      </section>

      <section className="home-business">
        <div>
          <span className="home-eyebrow">Run a business?</span>
          <h2>Your listing works in the app too.</h2>
          <p>Every business on PortPass is one tap away for anyone who installs it.</p>
        </div>
        <Link className="home-button home-button-light" href="/business">List your business →</Link>
      </section>

      <SiteFooter />
    </main>
  );
}

// A phone with Safari's toolbar and the Share sheet's "Add to Home Screen"
// row, highlighted in coral.
function IphoneShareDrawing() {
  return (
    <svg viewBox="0 0 260 300" role="img" aria-label="Safari with the Share button highlighted and the Add to Home Screen row in the share sheet">
      <rect x="20" y="8" width="220" height="284" rx="28" fill="#fff" stroke="#14303d" strokeWidth="3" />
      <rect x="40" y="34" width="180" height="26" rx="8" fill="#f2efe6" />
      <text x="130" y="52" textAnchor="middle" fontSize="12" fontFamily="Inter, Arial, sans-serif" fill="#14303d">portpassbahamas.com</text>
      <rect x="40" y="130" width="180" height="128" rx="14" fill="#fbfaf6" stroke="#dbd6c6" />
      <text x="56" y="154" fontSize="11" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">Copy</text>
      <text x="56" y="180" fontSize="11" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">Add to Reading List</text>
      <rect x="46" y="192" width="168" height="26" rx="8" fill="#B9532A" />
      <text x="56" y="209" fontSize="12" fontWeight="700" fontFamily="Inter, Arial, sans-serif" fill="#fff">Add to Home Screen</text>
      <rect x="188" y="197" width="16" height="16" rx="3" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M196 200v10M191 205h10" stroke="#fff" strokeWidth="2" />
      <text x="56" y="240" fontSize="11" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">Find on Page</text>
      <rect x="40" y="262" width="180" height="1" fill="#dbd6c6" />
      <circle cx="130" cy="278" r="12" fill="#B9532A" />
      <path d="M130 271v10M126 275l4-4 4 4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      <text x="70" y="282" fontSize="10" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">◀</text>
      <text x="184" y="282" fontSize="10" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">▶</text>
    </svg>
  );
}

// A phone with Chrome's ⋮ menu open and "Install app" highlighted.
function AndroidMenuDrawing() {
  return (
    <svg viewBox="0 0 260 300" role="img" aria-label="Chrome's menu with Install app highlighted">
      <rect x="20" y="8" width="220" height="284" rx="22" fill="#fff" stroke="#14303d" strokeWidth="3" />
      <rect x="40" y="30" width="150" height="26" rx="13" fill="#f2efe6" />
      <text x="52" y="48" fontSize="12" fontFamily="Inter, Arial, sans-serif" fill="#14303d">portpassbahamas.com</text>
      <circle cx="214" cy="37" r="2" fill="#14303d" />
      <circle cx="214" cy="43" r="2" fill="#14303d" />
      <circle cx="214" cy="49" r="2" fill="#14303d" />
      <rect x="84" y="62" width="150" height="150" rx="12" fill="#fbfaf6" stroke="#dbd6c6" />
      <text x="98" y="86" fontSize="11" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">New tab</text>
      <text x="98" y="110" fontSize="11" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">History</text>
      <text x="98" y="134" fontSize="11" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">Downloads</text>
      <rect x="90" y="146" width="138" height="26" rx="8" fill="#B9532A" />
      <path d="M100 152v10M96 158l4 4 4-4M94 166h12" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x="116" y="163" fontSize="12" fontWeight="700" fontFamily="Inter, Arial, sans-serif" fill="#fff">Install app</text>
      <text x="98" y="194" fontSize="11" fontFamily="Inter, Arial, sans-serif" fill="#5a6b64">Settings</text>
      <rect x="40" y="228" width="180" height="40" rx="10" fill="#f2efe6" />
      <text x="130" y="252" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="Inter, Arial, sans-serif" fill="#14303d">Get the PortPass app · Install</text>
    </svg>
  );
}
