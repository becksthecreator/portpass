import Link from "next/link";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { portpassWhatsAppUrl } from "@/lib/contact";
import { requireSignedIn } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Set up your business | PortPass Bahamas",
  robots: { index: false, follow: false },
};

// Placeholder for the owner setup wizard (the next accounts block). A
// business sign-up lands here today with their details saved on the
// account; the path is claimed now so nothing has to move later.
export default async function BusinessSetupPage() {
  const session = await requireSignedIn("/business/setup");
  const first = (session.profile?.fullName ?? "").split(" ")[0] || "there";
  return (
    <main className="form-page auth-page">
      <SiteHeader breadcrumb={[{ label: "For business", href: "/business" }, { label: "Set up", href: "/business/setup" }]} />
      <div className="auth-card auth-card-wide">
        <div className="eyebrow"><span className="eyebrow-dot" />Your business on PortPass</div>
        <h1>Thanks, {first}. Your account is ready.</h1>
        <p className="auth-lead">The self-serve setup (photos, prices, payment details, your team) is being finished. Until it&rsquo;s here, the fastest way to get your page built is the same as always: send us your photos and prices on WhatsApp and we build it for you.</p>
        <div className="auth-actions">
          <a className="primary-button" href={portpassWhatsAppUrl("Hi PortPass — I've created my account and want my business page built.")} target="_blank" rel="noopener noreferrer">Message us on WhatsApp →</a>
          <Link className="auth-text-button" href="/apply">Or send the basics here</Link>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
