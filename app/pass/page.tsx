import Link from "next/link";
import { BrandLogo } from "@/app/_components/BrandLogo";
import { ShareGlyph } from "@/app/_components/PwaRegister";
import { InstallButton } from "@/app/app/InstallButton";
import { MemberPass } from "./MemberPass";
import "@/app/_components/perks/perks.css";

// The Member Pass (brief 10, 6.2). This page is the same for everyone and
// holds nothing about anyone: no header, footer or database, so the app
// keeps a copy and it opens with no signal. The pass itself (a first
// name, the member number and the code) is fetched by MemberPass from
// /api/account/pass, which is where the sign-in is checked.
export const metadata = {
  title: "Member Pass | PortPass Bahamas",
  description: "Your PortPass Member Pass: show it at the counter for member perks.",
  robots: { index: false, follow: false },
};

export default function MemberPassPage() {
  return (
    <main className="pass-page theme-night">
      <header className="pass-top">
        <Link className="brand" href="/" aria-label="PortPass home"><BrandLogo /></Link>
        <Link className="pass-top-link" href="/perks">Member perks</Link>
      </header>

      <MemberPass />

      <section className="pass-install" aria-labelledby="pass-install-title">
        <h2 id="pass-install-title">Save your Member Pass to your home screen</h2>
        <p>Like a boarding pass: one tap at the counter, and it still opens with no signal for ten minutes after you last had one.</p>
        <InstallButton />
        <div className="pass-install-steps">
          <div>
            <h3>iPhone and iPad</h3>
            <ol>
              <li>Open this page in <b>Safari</b>.</li>
              <li>Tap <b>Share</b> <ShareGlyph className="app-inline" />.</li>
              <li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            </ol>
          </div>
          <div>
            <h3>Android</h3>
            <ol>
              <li>Open this page in <b>Chrome</b>.</li>
              <li>Tap <b>Install</b>, or the menu <b>⋮</b>.</li>
              <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
            </ol>
          </div>
        </div>
        <p className="pass-install-more"><Link href="/app">More about the PortPass app →</Link></p>
      </section>
    </main>
  );
}
