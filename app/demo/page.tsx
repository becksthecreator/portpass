// @public-route: the front door of the demo business; one tap starts a demo session.
import Link from "next/link";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Try a demo business | PortPass Bahamas",
  description: "Explore a made-up business on PortPass: registrations, payment requests, attendance and a growth report. Example data only.",
  // The demo is never in search results or the sitemap.
  robots: { index: false, follow: false },
};

// /demo (brief 18, part B): what a business sees on PortPass, with a
// made-up business anyone can press buttons on. One tap opens it.
export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="form-page auth-page theme-night">
      <SiteHeader breadcrumb={[{ label: "Demo", href: "/demo" }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />Demo</div>
        <h1>See what a business sees.</h1>
        <p className="auth-lead">Harbour Kids Club is a made-up business. Open it and press anything: take a registration, send a payment request, mark it paid, mark who came. Nothing is real, and nothing is sent to anyone.</p>
        {error && <p className="form-error" role="alert">{error === "busy" ? "Too many tries in a short time. Wait a few minutes." : "The demo couldn't be opened just now. Try again in a moment."}</p>}
        <form className="demo-start" method="post" action="/demo/start">
          <button className="primary-button" type="submit">Open the demo →</button>
        </form>
        <p className="auth-hint">No account and nothing to fill in. It closes by itself after two hours.</p>

        <ul className="demo-inside" aria-label="What is in the demo">
          <li><strong>The booking page</strong><span>What customers see: prices, times and how to book.</span></li>
          <li><strong>Registrations</strong><span>Two classes and the families registered for them.</span></li>
          <li><strong>Payment requests</strong><span>Paid, part paid and overdue, and the chase list.</span></li>
          <li><strong>Attendance</strong><span>Three Saturdays marked, and a register to mark yourself.</span></li>
          <li><strong>The growth report</strong><span>Found you, asked, booked, paid, showed up.</span></li>
        </ul>

        <p className="auth-alt">Ready for your own page? <Link href="/own">Sign up in 30 seconds →</Link></p>
      </div>
      <SiteFooter />
    </main>
  );
}
